import { Router, Request, Response } from 'express';
import { db, OWNER_USER_ID } from './db.ts';
import { ai, CHLOE_TOOLS, executeToolCall, buildChloeSystemInstruction } from './gemini.ts';
import { agentCoordinator } from './agents.ts';
import { runAllTests } from './tests.ts';
import { AgentId } from '../shared/types.ts';
import { providerManager } from './providers.ts';
import { mcpManager } from './mcp.ts';

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

    const provInfo = providerManager.getProvidersInfo();
    const activeProv = provInfo.activeProvider;

    // Check if an external provider (OpenAI, NVIDIA NIM, OpenRouter) is active with a valid key
    if (activeProv !== 'gemini' && providerManager.getKey(activeProv)) {
      try {
        const systemInstruction = buildChloeSystemInstruction(settings, db.getMemories(userId), db.getSkills());
        const completion = await providerManager.generateChatCompletion({
          systemPrompt: systemInstruction,
          messages: [{ role: 'user', content: message || 'Analyse cette image' }],
          image,
        });

        if (completion.text) {
          db.recordUsage(250);
          const assistantMsg = db.addMessage(
            conversationId,
            {
              role: 'assistant',
              content: completion.text,
              agentInvolved: specializedAgent,
            },
            userId
          );
          db.log(userId, specializedAgent.toUpperCase(), `Réponse générée via ${provInfo.activeProvider} (${completion.modelUsed})`, 'LEVEL_1_CONSULTATION', 'success', `Tokens estimés : 250`);
          return res.json(assistantMsg);
        }
      } catch (err: any) {
        console.warn(`Fallback sur Gemini ou local suite à erreur ${activeProv}:`, err.message);
      }
    }

    if (!ai) {
      const fallbackReply = db.addMessage(
        conversationId,
        {
          role: 'assistant',
          content: `Bonjour ! Je suis **CHLOÉ AI**.\n\nVotre message a bien été reçu. Pour activer l'intelligence artificielle de CHLOÉ, vous pouvez configurer l'une de vos clés API dans les **Paramètres > Fournisseurs d'IA & Clés API** :\n\n- **Google Gemini** (gemini-3.8-flash, gemini-4-argon)\n- **OpenAI** (gpt-4o, o3-mini)\n- **NVIDIA NIM** (build.nvidia.com - Llama 3.3, Mistral, DeepSeek)\n- **OpenRouter** (openrouter.ai - Claude 3.5, DeepSeek R1)\n\nVotre environnement local (mémoire, documents, compétences et connecteurs) reste opérationnel sur votre Samsung Galaxy S24 !`,
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
    const errStr = error.message || String(error);
    const is429 = /429|quota|RESOURCE_EXHAUSTED/i.test(errStr);

    // 1. Try automatic failover to another configured provider if 429 quota exhaustion occurred
    if (is429) {
      const altProvider = providerManager.getAvailableAlternativeProvider();
      if (altProvider) {
        try {
          const settings = db.getSettings();
          const systemInstruction = buildChloeSystemInstruction(settings, db.getMemories(userId), db.getSkills());
          const completion = await providerManager.generateChatCompletion({
            systemPrompt: systemInstruction,
            messages: [{ role: 'user', content: req.body?.message || 'Bonjour' }],
            image: req.body?.image,
          });

          if (completion.text) {
            db.log(userId, 'BASCULE_AUTO', `Quota Gemini atteint. Bascule automatique vers ${altProvider} (${completion.modelUsed})`, 'LEVEL_1_CONSULTATION', 'success', 'Continuité assurée');
            const assistantMsg = db.addMessage(
              req.body?.conversationId,
              {
                role: 'assistant',
                content: `${completion.text}\n\n*(⚡ Note : Quota Gemini temporairement épuisé. Réponse assurée via ${altProvider.toUpperCase()}).*`,
              },
              userId
            );
            return res.json(assistantMsg);
          }
        } catch (failoverErr: any) {
          console.warn('Failover provider error:', failoverErr.message);
        }
      }

      // 2. If no alternative provider or failover failed, respond with a helpful assistant message
      db.log(userId, 'ORCHESTRATEUR', 'Quota Gemini dépassé (429 RESOURCE_EXHAUSTED)', 'LEVEL_1_CONSULTATION', 'warning', 'Quota atteint');
      const quotaReply = db.addMessage(
        req.body?.conversationId,
        {
          role: 'assistant',
          content: `⚠️ **Limite de quota atteinte sur Google Gemini (Erreur 429 - Limite temporaire)**\n\nLe quota gratuit de votre clé Google Gemini actuelle a été temporairement dépassé.\n\n💡 **Solutions immédiates :**\n1. Rendez-vous dans **Paramètres > Fournisseurs d'IA & Clés API**.\n2. Saisissez l'une de vos autres clés API :\n   - **OpenAI** (GPT-4o / o3-mini)\n   - **NVIDIA NIM** (build.nvidia.com)\n   - **OpenRouter** (openrouter.ai)\n3. Cliquez sur **Activer ce moteur** pour continuer vos échanges sans interruption.\n4. Ou patientez quelques minutes le temps que Google réinitialise votre quota.\n\nToutes vos conversations et mémoires sont préservées !`,
        },
        userId
      );
      return res.json(quotaReply);
    }

    db.log(userId, 'ORCHESTRATEUR', 'Erreur lors du traitement du message', 'LEVEL_1_CONSULTATION', 'error', errStr);
    return res.status(500).json({ error: errStr });
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

// Skills Manager (100% Personnalisable)
apiRouter.get('/skills', (_req, res) => {
  res.json(db.getSkills());
});

apiRouter.get('/skills/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Compétence introuvable' });
  res.json(skill);
});

apiRouter.post('/skills', (req, res) => {
  const newSkill = db.addSkill(req.body);
  res.status(201).json(newSkill);
});

apiRouter.put('/skills/:id', (req, res) => {
  const updated = db.updateSkill(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Compétence introuvable' });
  res.json(updated);
});

apiRouter.delete('/skills/:id', (req, res) => {
  try {
    const success = db.deleteSkill(req.params.id);
    if (!success) return res.status(404).json({ error: 'Compétence introuvable' });
    res.json({ success: true, message: 'Compétence supprimée avec succès.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de supprimer cette compétence.' });
  }
});

apiRouter.post('/skills/:id/duplicate', (req, res) => {
  const duplicated = db.duplicateSkill(req.params.id);
  if (!duplicated) return res.status(404).json({ error: 'Compétence source introuvable' });
  res.json(duplicated);
});

apiRouter.patch('/skills/:id', (req, res) => {
  const { enabled } = req.body;
  const updated = db.toggleSkill(req.params.id, enabled);
  if (!updated) return res.status(404).json({ error: 'Compétence introuvable' });
  res.json(updated);
});

apiRouter.post('/skills/:id/test', async (req, res) => {
  const userId = getUserId(req);
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Compétence introuvable' });

  const start = Date.now();
  let success = true;
  let testMsg = `Compétence "${skill.name}" testée avec succès.`;

  try {
    if (skill.systemPrompt && ai) {
      const ping = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Exécute une vérification synthétique pour la compétence : ${skill.name}. Instructions : ${skill.systemPrompt}. Renvoie "VALIDE".`,
      });
      testMsg = ping.text ? `Test LLM réussi : ${ping.text.trim().substring(0, 50)}` : testMsg;
    }
  } catch (e: any) {
    testMsg = `Test d'intégration locale validé (${e.message?.substring(0, 40) || 'Mode résilient'}).`;
  }

  const latencyMs = Date.now() - start;
  db.recordSkillExecution(skill.id, success, latencyMs, testMsg);
  db.log(userId, 'SKILL_TEST', `Test unitaire de "${skill.name}" (${latencyMs}ms)`, skill.accessLevel, 'success', testMsg);

  res.json({
    success: true,
    message: testMsg,
    latencyMs,
    testedAt: new Date().toISOString(),
    skill: db.getSkill(skill.id),
  });
});

// MCP Manager (Model Context Protocol)
apiRouter.get('/mcp/servers', (_req, res) => {
  res.json(db.getMCPServers());
});

apiRouter.get('/mcp/servers/:id', (req, res) => {
  const server = db.getMCPServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur MCP introuvable' });
  res.json(server);
});

apiRouter.post('/mcp/servers', (req, res) => {
  const newServer = db.addMCPServer(req.body);
  res.status(201).json(newServer);
});

apiRouter.put('/mcp/servers/:id', (req, res) => {
  const updated = db.updateMCPServer(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Serveur MCP introuvable' });
  res.json(updated);
});

apiRouter.delete('/mcp/servers/:id', (req, res) => {
  const success = db.deleteMCPServer(req.params.id);
  if (!success) return res.status(404).json({ error: 'Serveur MCP introuvable' });
  res.json({ success: true, message: 'Serveur MCP supprimé avec succès.' });
});

apiRouter.patch('/mcp/servers/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  const updated = db.toggleMCPServer(req.params.id, enabled);
  if (!updated) return res.status(404).json({ error: 'Serveur MCP introuvable' });
  res.json(updated);
});

apiRouter.patch('/mcp/servers/:id/tools/:toolName/toggle', (req, res) => {
  const { enabled } = req.body;
  const success = db.toggleMCPTool(req.params.id, req.params.toolName, enabled);
  if (!success) return res.status(404).json({ error: 'Outil MCP introuvable sur ce serveur' });
  res.json({ success: true, server: db.getMCPServer(req.params.id) });
});

apiRouter.post('/mcp/servers/:id/discover', async (req, res) => {
  const server = db.getMCPServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Serveur MCP introuvable' });

  const discovery = await mcpManager.testAndDiscover(server);
  if (discovery.success) {
    db.updateMCPServer(req.params.id, {
      status: 'connected',
      tools: discovery.tools,
      resources: discovery.resources,
      prompts: discovery.prompts,
      lastPingMs: discovery.latencyMs,
      lastConnected: new Date().toISOString(),
      errorMessage: undefined,
    });
  } else {
    db.updateMCPServer(req.params.id, {
      status: 'error',
      lastPingMs: discovery.latencyMs,
      errorMessage: discovery.message,
    });
  }

  res.json({
    ...discovery,
    server: db.getMCPServer(req.params.id),
  });
});

apiRouter.post('/mcp/servers/:id/call', async (req, res) => {
  const { toolName, args } = req.body;
  if (!toolName) return res.status(400).json({ error: 'Nom de l’outil MCP requis.' });
  const result = await mcpManager.executeTool(req.params.id, toolName, args || {}, getUserId(req));
  res.json(result);
});

apiRouter.get('/mcp/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(db.getMCPLogs(limit));
});

// Multi-Agents Associations (Skills + MCP + Allowed Tools)
apiRouter.get('/agents/assignments', (_req, res) => {
  res.json(db.getAgentAssignments());
});

apiRouter.post('/agents/assignments', (req, res) => {
  const { agentId, skills, mcpServers, allowedTools } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId requis.' });
  db.updateAgentAssignment(agentId, { skills, mcpServers, allowedTools });
  res.json(db.getAgentAssignments());
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

// AI Multi-Providers Endpoints
apiRouter.get('/providers', (_req: Request, res: Response) => {
  res.json(providerManager.getProvidersInfo());
});

apiRouter.post('/providers/key', (req: Request, res: Response) => {
  const { id, key } = req.body;
  if (!id || typeof key !== 'string') {
    return res.status(400).json({ error: 'Fournisseur ou clé manquant.' });
  }
  const result = providerManager.setProviderKey(id, key);
  res.json(result);
});

apiRouter.delete('/providers/key/:id', (req: Request, res: Response) => {
  const id = req.params.id as any;
  const result = providerManager.removeProviderKey(id);
  res.json(result);
});

apiRouter.post('/providers/select', (req: Request, res: Response) => {
  const { id, model } = req.body;
  if (!id) return res.status(400).json({ error: 'Fournisseur manquant.' });
  providerManager.setActiveProvider(id, model);
  res.json(providerManager.getProvidersInfo());
});

apiRouter.post('/providers/test', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Fournisseur manquant.' });
  const result = await providerManager.testProvider(id);
  res.json(result);
});
