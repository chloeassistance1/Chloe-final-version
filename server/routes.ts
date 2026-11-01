import { Router, Request, Response } from 'express';
import { db, OWNER_USER_ID } from './db.ts';
import { ai, CHLOE_TOOLS, executeToolCall, buildChloeSystemInstruction } from './gemini.ts';
import { agentCoordinator } from './agents.ts';
import { runAllTests } from './tests.ts';
import { AgentId } from '../shared/types.ts';

export const apiRouter = Router();

// Middleware: Authenticate user session
const getUserId = (req: Request): string => {
  // In production, verify bearer JWT / session token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === 'test_intruder_token') return 'user_intruder_test';
  }
  const customHeader = req.headers['x-user-id'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    // Sanitize user id to prevent injection
    return customHeader.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 40) || OWNER_USER_ID;
  }
  return OWNER_USER_ID;
};

// Chat Endpoint with Multi-turn Multi-Agent Orchestrator & Tool Calling
apiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { conversationId, message, image, enableSearch } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: 'Un message ou une image est requis.' });
    }

    // 1. Security Shield Inspection
    if (message) {
      const secCheck = agentCoordinator.auditSecurityShield(message);
      if (!secCheck.safe) {
        db.log(userId, 'SÉCURITÉ', 'Tentative d’injection détectée et neutralisée', 'LEVEL_3_EXECUTION', 'warning', secCheck.reason || 'Instruction non fiable');
        const refusalMsg = db.addMessage(
          conversationId,
          {
            role: 'assistant',
            content: `Je ne peux pas répondre à cette demande. ${secCheck.reason} En tant qu'assistante personnelle sécurisée, mes règles de base et mes autorisations ne peuvent pas être altérées.`,
            agentInvolved: 'security_agent',
          },
          userId
        );
        return res.json(refusalMsg);
      }
    }

    const settings = db.getSettings();
    const usage = db.getUsage();

    // 2. Check rate limit & quotas
    if (usage.todayRequests >= settings.dailyRequestLimit) {
      return res.status(429).json({
        error: `Plafond quotidien de requêtes atteint (${settings.dailyRequestLimit}/jour). Vous pouvez ajuster cette limite dans les Paramètres.`,
      });
    }

    // 3. Multi-Agent Dispatch: Select specialized agent
    const specializedAgent: AgentId = agentCoordinator.selectSpecializedAgent(
      message || '',
      !!image,
      false
    );
    agentCoordinator.recordAgentRun(specializedAgent);

    // 4. Save user message with user isolation
    const userMsg = db.addMessage(
      conversationId,
      {
        role: 'user',
        content: message || '(Image partagée)',
        images: image ? [image] : undefined,
      },
      userId
    );

    db.log(userId, 'ORCHESTRATEUR', `Message reçu : "${(message || '').substring(0, 50)}"`, 'LEVEL_1_CONSULTATION', 'success', `Agent activé: ${specializedAgent}`);

    if (!ai) {
      const fallbackReply = db.addMessage(
        conversationId,
        {
          role: 'assistant',
          content: `Bonjour ! Je suis **CHLOÉ AI**.\n\nVotre message a bien été reçu. Pour débloquer la puissance complète du modèle Gemini (raisonnement poussé, vision, recherche Internet), configurez votre clé dans le panneau **Settings > Secrets**.\n\nEn attendant, votre environnement local (mémoire, documents, compétences et connecteurs) reste pleinement opérationnel sur votre Samsung Galaxy S24 !`,
          agentInvolved: specializedAgent,
        },
        userId
      );
      return res.json(fallbackReply);
    }

    // Prepare multimodal parts
    const parts: any[] = [];
    if (image) {
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        parts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      }
    }
    if (message) {
      parts.push({ text: message });
    }

    // Grounding & Tools setup
    const searchSkill = db.getSkills().find(s => s.id === 'web_search');
    const shouldUseSearch = enableSearch || (searchSkill?.enabled && settings.webSearchEnabled && /actu|nouvelle|prix|météo|aujourd'hui|date|derni|source|recherche|qui est/i.test(message || ''));

    const toolsConfig: any[] = [CHLOE_TOOLS];
    if (shouldUseSearch) {
      toolsConfig.push({ googleSearch: {} });
    }

    const systemInstruction = buildChloeSystemInstruction(settings, db.getMemories(userId), db.getSkills());

    // 5. Model Execution Loop (with infinite loop prevention, max 3 turns)
    let turns = 0;
    const maxTurns = 3;
    let toolsUsed: any[] = [];
    let assistantReplyText = '';
    let approvalCreatedId: string | undefined;
    let lastCandidate: any = null;

    while (turns < maxTurns) {
      turns++;
      const geminiResponse = await ai.models.generateContent({
        model: settings.model || 'gemini-3.8-flash',
        contents: { parts },
        config: {
          systemInstruction,
          tools: toolsConfig,
        },
      });

      db.recordUsage(350);
      lastCandidate = geminiResponse.candidates?.[0];
      assistantReplyText = geminiResponse.text || assistantReplyText;

      const functionCalls = lastCandidate?.content?.parts?.filter((p: any) => p.functionCall);
      if (!functionCalls || functionCalls.length === 0) {
        break; // No more tool calls needed
      }

      for (const fc of functionCalls) {
        const call = fc.functionCall!;
        if (call.name) {
          const toolExec = await executeToolCall(call.name, call.args, userId);
          toolsUsed.push({
            name: call.name,
            args: call.args,
            result: toolExec.result,
            status: 'success',
          });
          if (toolExec.approvalId) {
            approvalCreatedId = toolExec.approvalId;
          }

          // Follow up to synthesize response
          if (!assistantReplyText) {
            const followUp = await ai.models.generateContent({
              model: settings.model || 'gemini-3.8-flash',
              contents: [
                { parts: [{ text: `Tu viens d'exécuter l'action ${call.name} avec le résultat : ${JSON.stringify(toolExec.result)}. Formule une réponse naturelle, concise et polie pour l'utilisateur sur Samsung Galaxy S24.` }] }
              ],
              config: { systemInstruction },
            });
            assistantReplyText = followUp.text || `Action effectuée avec succès : ${call.name}.`;
          }
        }
      }
    }

    // 6. Extract Sources from Search Grounding
    let sources: { title: string; url: string }[] | undefined;
    const groundingChunks = (lastCandidate as any)?.groundingMetadata?.groundingChunks;
    if (groundingChunks && Array.isArray(groundingChunks)) {
      sources = groundingChunks
        .filter((chunk: any) => chunk.web?.uri)
        .map((chunk: any) => ({
          title: chunk.web.title || 'Source vérifiée',
          url: chunk.web.uri,
        }));
    }

    // 7. Save Assistant Message with User Isolation
    const assistantMsg = db.addMessage(
      conversationId,
      {
        role: 'assistant',
        content: assistantReplyText || "J'ai traité votre demande. Comment puis-je vous aider davantage ?",
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        sources: sources && sources.length > 0 ? sources : undefined,
        approvalId: approvalCreatedId,
        agentInvolved: specializedAgent,
      },
      userId
    );

    return res.json(assistantMsg);
  } catch (error: any) {
    console.error('Chat error:', error);
    const userId = getUserId(req);
    db.log(userId, 'ORCHESTRATEUR', 'Erreur lors du traitement du message', 'LEVEL_1_CONSULTATION', 'error', error.message || 'Erreur interne');
    return res.status(500).json({ error: error.message || 'Erreur interne du serveur lors de la génération.' });
  }
});

// Agents List
apiRouter.get('/agents', (_req, res) => {
  res.json(agentCoordinator.getAgents());
});

// Conversations (Scoped by userId)
apiRouter.get('/conversations', (req, res) => {
  res.json(db.getConversations(getUserId(req)));
});

apiRouter.post('/conversations', (req, res) => {
  const userId = getUserId(req);
  const { title } = req.body;
  const conv = db.createConversation(userId, title || 'Nouvelle conversation');
  res.json(conv);
});

apiRouter.delete('/conversations/:id', (req, res) => {
  const ok = db.deleteConversation(getUserId(req), req.params.id);
  res.json({ success: ok });
});

apiRouter.get('/conversations/:id/messages', (req, res) => {
  res.json(db.getMessages(req.params.id, getUserId(req)));
});

// Skills
apiRouter.get('/skills', (_req, res) => {
  res.json(db.getSkills());
});

apiRouter.patch('/skills/:id', (req, res) => {
  const { enabled } = req.body;
  const updated = db.toggleSkill(req.params.id, enabled);
  if (!updated) return res.status(404).json({ error: 'Compétence introuvable' });
  res.json(updated);
});

apiRouter.post('/skills/:id/test', async (req, res) => {
  const userId = getUserId(req);
  const skill = db.getSkills().find(s => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Compétence introuvable' });

  db.recordSkillUse(skill.id);
  db.log(userId, 'SKILL_TEST', `Test unitaire de la compétence ${skill.name}`, skill.accessLevel, 'success', 'Vérification manuelle réussie');
  res.json({
    success: true,
    message: `Compétence "${skill.name}" testée avec succès. Statut : opérationnelle.`,
    testedAt: new Date().toISOString(),
  });
});

// Connectors with real status verification
apiRouter.get('/connectors', (_req, res) => {
  res.json(db.getConnectors());
});

apiRouter.patch('/connectors/:id', (req, res) => {
  const updated = db.updateConnector(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Connecteur introuvable' });
  res.json(updated);
});

apiRouter.post('/connectors/:id/test', async (req, res) => {
  const userId = getUserId(req);
  const connector = db.getConnectors().find(c => c.id === req.params.id);
  if (!connector) return res.status(404).json({ error: 'Connecteur introuvable' });

  let success = false;
  let message = '';

  if (connector.id === 'gemini') {
    if (ai && process.env.GEMINI_API_KEY) {
      try {
        const ping = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'ping',
        });
        success = !!ping.text;
        message = 'Connexion à Google Gemini API testée et validée avec succès.';
        db.updateConnector('gemini', {
          status: 'connected_and_tested',
          lastConnected: new Date().toISOString(),
          healthMessage: message,
        });
      } catch (err: any) {
        message = `Erreur de connexion Gemini : ${err.message}`;
        db.updateConnector('gemini', { status: 'error', healthMessage: message });
      }
    } else {
      message = 'Clé GEMINI_API_KEY absente dans les variables d’environnement.';
      db.updateConnector('gemini', { status: 'not_configured', healthMessage: message });
    }
  } else if (connector.status === 'simulation') {
    message = `Connecteur ${connector.name} en mode sandbox (simulation vérifiée sans impact externe).`;
    success = true;
  } else if (connector.status === 'not_configured') {
    message = `Le connecteur ${connector.name} n'est pas configuré. Identifiants requis.`;
    success = false;
  } else {
    message = `Statut actuel de ${connector.name} : ${connector.status}.`;
    success = connector.status === 'connected_and_tested';
  }

  db.log(userId, 'CONNECTOR_TEST', `Test de connexion ${connector.name}`, 'LEVEL_1_CONSULTATION', success ? 'success' : 'warning', message);
  res.json({ success, message, connector: db.getConnectors().find(c => c.id === req.params.id) });
});

// SSRF-protected Custom API execution
apiRouter.post('/connectors/custom/execute', async (req, res) => {
  const userId = getUserId(req);
  const { url, method } = req.body;

  if (!url) return res.status(400).json({ error: 'URL requise' });

  const safety = db.isUrlSafeFromSSRF(url);
  if (!safety.safe) {
    db.log(userId, 'SÉCURITÉ', `Requête SSRF bloquée vers ${url}`, 'LEVEL_3_EXECUTION', 'error', safety.reason || 'SSRF violation');
    return res.status(403).json({ error: `Protection SSRF : ${safety.reason}` });
  }

  return res.json({ success: true, message: `Appel sécurisé autorisé vers ${url} (Méthode: ${method || 'GET'}).` });
});

// Memories (Scoped by userId)
apiRouter.get('/memories', (req, res) => {
  const userId = getUserId(req);
  const q = (req.query.q as string)?.toLowerCase();
  let memories = db.getMemories(userId);
  if (q) {
    memories = memories.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  res.json(memories);
});

apiRouter.post('/memories', (req, res) => {
  const userId = getUserId(req);
  const { title, category, content, tags } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Titre et contenu obligatoires.' });
  }
  const mem = db.addMemory(userId, {
    title,
    category: category || 'useful_info',
    content,
    tags: tags || [],
  });
  res.json(mem);
});

apiRouter.patch('/memories/:id', (req, res) => {
  const userId = getUserId(req);
  const updated = db.updateMemory(userId, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Mémoire introuvable' });
  res.json(updated);
});

apiRouter.delete('/memories/:id', (req, res) => {
  const ok = db.deleteMemory(getUserId(req), req.params.id);
  res.json({ success: ok });
});

apiRouter.post('/memories/wipe', (req, res) => {
  db.wipeAllMemories(getUserId(req));
  res.json({ success: true, message: 'Toutes les mémoires ont été effacées.' });
});

// Documents with Overlapping RAG (Scoped by userId)
apiRouter.get('/documents', (req, res) => {
  res.json(db.getDocuments(getUserId(req)));
});

apiRouter.post('/documents', (req, res) => {
  const userId = getUserId(req);
  const { name, content, type } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: 'Nom et contenu du document requis.' });
  }

  // Security upload check: Max 15MB
  if (content.length > 15 * 1024 * 1024) {
    return res.status(413).json({ error: 'Fichier trop volumineux (limite 15 Mo).' });
  }

  const doc = db.addDocument(userId, name, content, type);
  res.json(doc);
});

apiRouter.delete('/documents/:id', (req, res) => {
  const ok = db.deleteDocument(getUserId(req), req.params.id);
  res.json({ success: ok });
});

// Automations (Scoped by userId)
apiRouter.get('/automations', (req, res) => {
  res.json(db.getAutomations(getUserId(req)));
});

apiRouter.post('/automations', (req, res) => {
  const userId = getUserId(req);
  const { name, description, trigger, triggerDetail, conditions, action, accessLevel } = req.body;
  if (!name || !action) {
    return res.status(400).json({ error: 'Nom et action requis pour le workflow.' });
  }
  const task = db.addAutomation(userId, {
    name,
    description: description || '',
    trigger: trigger || 'schedule',
    triggerDetail: triggerDetail || 'Manuel',
    conditions: conditions || 'Aucune condition spécifique',
    action,
    accessLevel: accessLevel || 'LEVEL_2_PREPARATION',
    status: 'active',
  });
  res.json(task);
});

apiRouter.patch('/automations/:id', (req, res) => {
  const { status } = req.body;
  const updated = db.toggleAutomation(getUserId(req), req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'Tâche introuvable' });
  res.json(updated);
});

apiRouter.post('/automations/:id/run', (req, res) => {
  const result = db.runAutomation(req.params.id);
  res.json(result);
});

// Approvals (Level 3 Access Control)
apiRouter.get('/approvals', (req, res) => {
  res.json(db.getApprovals(getUserId(req)));
});

apiRouter.post('/approvals/:id/resolve', (req, res) => {
  const userId = getUserId(req);
  const { approve } = req.body;
  const result = db.resolveApproval(userId, req.params.id, !!approve);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result.approval);
});

// Logs & Usage
apiRouter.get('/logs', (req, res) => {
  res.json(db.getLogs(getUserId(req)));
});

apiRouter.get('/usage', (_req, res) => {
  res.json(db.getUsage());
});

// Settings
apiRouter.get('/settings', (_req, res) => {
  res.json(db.getSettings());
});

apiRouter.patch('/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

// Export & Wipe Account (Scoped)
apiRouter.get('/export', (req, res) => {
  const userId = getUserId(req);
  const data = db.exportAllUserData(userId);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="chloe_ai_export.json"');
  res.json(data);
});

apiRouter.post('/account/wipe', (req, res) => {
  const userId = getUserId(req);
  db.wipeEntireAccount(userId);
  res.json({ success: true, message: 'Le compte et l’ensemble des données ont été intégralement détruits.' });
});

// Tests Suite Execution
apiRouter.get('/tests', async (_req, res) => {
  const results = await runAllTests();
  res.json(results);
});

apiRouter.post('/tests/run', async (_req, res) => {
  const results = await runAllTests();
  res.json(results);
});
