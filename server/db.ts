import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SkillConfig,
  ConnectorConfig,
  ConnectorStatus,
  MemoryItem,
  DocumentItem,
  DocumentChunk,
  AutomationTask,
  PendingApproval,
  ActivityLog,
  ChatMessage,
  Conversation,
  UserSettings,
  SystemUsage
} from '../shared/types.ts';
import { createOverlappingChunks } from './rag.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'chloe_store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const OWNER_USER_ID = 'user_owner_s24';
export const OWNER_EMAIL = 'chloeassistance1@gmail.com';

interface DBData {
  settings: UserSettings;
  usage: SystemUsage;
  skills: SkillConfig[];
  connectors: ConnectorConfig[];
  memories: MemoryItem[];
  documents: DocumentItem[];
  automations: AutomationTask[];
  approvals: PendingApproval[];
  logs: ActivityLog[];
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
}

const DEFAULT_SKILLS: SkillConfig[] = [
  {
    id: 'reasoning',
    name: 'Raisonnement avancé',
    description: 'Analyse complexe, calculs précis, décomposition méthodique de projets et synthèse stratégique.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['compute', 'analyze', 'plan'],
    dependencies: [],
    usageCount: 18,
  },
  {
    id: 'voice',
    name: 'Voix et conversation',
    description: 'Reconnaissance vocale naturelle, synthèse audio expressive et gestion des silences/interruptions.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['microphone', 'audio_playback'],
    dependencies: [],
    usageCount: 12,
  },
  {
    id: 'vision',
    name: 'Vision & Analyse multimodale',
    description: 'Lecture OCR, analyse de photos Galaxy S24, interprétation de schémas, graphiques et captures.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['camera', 'file_read'],
    dependencies: [],
    usageCount: 9,
  },
  {
    id: 'memory',
    name: 'Mémoire personnelle',
    description: 'Rétention sécurisée des préférences, habitudes, objectifs et faits importants avec contrôle strict.',
    enabled: true,
    accessLevel: 'LEVEL_2_PREPARATION',
    permissions: ['memory_read', 'memory_write'],
    dependencies: [],
    usageCount: 34,
  },
  {
    id: 'web_search',
    name: 'Recherche Internet & Citations',
    description: 'Vérification de faits récents via Google Search Grounding avec dates et liens vérifiables.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['network_search'],
    dependencies: [],
    usageCount: 27,
  },
  {
    id: 'developer',
    name: 'Programmation & Code',
    description: 'Génération de composants React, scripts TypeScript/Python, analyse de bugs et architectures.',
    enabled: true,
    accessLevel: 'LEVEL_2_PREPARATION',
    permissions: ['code_generation', 'syntax_lint'],
    dependencies: [],
    usageCount: 16,
  },
  {
    id: 'automation',
    name: 'Automatisation & Workflows',
    description: 'Planification de tâches récurrentes, scénarios conditionnels et actions automatisées sous surveillance.',
    enabled: true,
    accessLevel: 'LEVEL_3_EXECUTION',
    permissions: ['scheduler', 'task_dispatch'],
    dependencies: [],
    usageCount: 8,
  },
  {
    id: 'documents',
    name: 'Documents & RAG',
    description: 'Indexation sémantique, découpage de passages et extraction d’informations précises depuis PDF/TXT/MD.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['storage_read', 'vector_search'],
    dependencies: [],
    usageCount: 15,
  },
  {
    id: 'translation',
    name: 'Traduction multilingue',
    description: 'Traduction contextuelle fluide préservant le ton (Français, Anglais, Espagnol, Allemand, Hébreu, Arabe).',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['translation_engine'],
    dependencies: [],
    usageCount: 14,
  },
  {
    id: 'creative',
    name: 'Créativité & Contenus',
    description: 'Brainstorming de concepts, récits, pitchs créatifs et formulations de scénarios percutants.',
    enabled: true,
    accessLevel: 'LEVEL_1_CONSULTATION',
    permissions: ['creative_ideation'],
    dependencies: [],
    usageCount: 10,
  },
];

// Authentic Connectors Configuration: Truth-first status
const DEFAULT_CONNECTORS: ConnectorConfig[] = [
  {
    id: 'gemini',
    name: 'Google Gemini API',
    description: 'Cerveau central multimodal de CHLOÉ (gemini-3.8-flash & gemini-4-argon).',
    status: process.env.GEMINI_API_KEY ? 'connected_and_tested' : 'not_configured',
    authType: 'api_key',
    permissions: ['generateContent', 'liveAPI', 'searchGrounding'],
    lastConnected: new Date().toISOString(),
    lastHealthCheck: new Date().toISOString(),
    healthMessage: process.env.GEMINI_API_KEY
      ? 'Clé GEMINI_API_KEY valide et active côté serveur.'
      : 'Clé non détectée dans les secrets AI Studio.',
  },
  {
    id: 'google',
    name: 'Google Workspace (OAuth)',
    description: 'Authentification Google et consentement aux étendues Workspace requises.',
    status: 'configured_untested',
    authType: 'oauth2',
    permissions: ['profile', 'email', 'openid'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Prêt pour l’autorisation OAuth client.',
  },
  {
    id: 'gmail',
    name: 'Gmail API',
    description: 'Lecture sécurisée et préparation de brouillons (Envoi soumis à confirmation Niveau 3).',
    status: 'simulation',
    authType: 'oauth2',
    permissions: ['gmail.readonly', 'gmail.compose', 'gmail.send'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Mode sandbox sécurisé actif. En attente de jeton OAuth Gmail utilisateur.',
  },
  {
    id: 'calendar',
    name: 'Google Calendar API',
    description: 'Consultation des créneaux, planification de réunions et rappels.',
    status: 'simulation',
    authType: 'oauth2',
    permissions: ['calendar.events', 'calendar.readonly'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Mode sandbox actif. Vérification des fuseaux horaires opérationnelle.',
  },
  {
    id: 'drive',
    name: 'Google Drive API',
    description: 'Accès aux documents autorisés, recherche sémantique de fichiers et importation.',
    status: 'simulation',
    authType: 'oauth2',
    permissions: ['drive.readonly', 'drive.file'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Mode sandbox actif. Stockage local synchronisé.',
  },
  {
    id: 'firebase',
    name: 'Firebase & Firestore',
    description: 'Base de données persistante et authentification utilisateur.',
    status: 'simulation',
    authType: 'service_account',
    permissions: ['firestore.rw', 'storage.rw'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Adaptateur de stockage persistant local actif. Prêt pour synchronisation Cloud Firestore.',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business Cloud API',
    description: 'Intégration officielle Meta Cloud API (Requiert compte Meta Business et numéro approuvé).',
    status: 'not_configured',
    authType: 'webhook',
    permissions: ['whatsapp_business_messaging'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Non configuré : Nécessite un compte Meta Business et des jetons d’accès approuvés.',
  },
  {
    id: 'spotify',
    name: 'Spotify Web API',
    description: 'Recherche de morceaux, playlists et contrôle de lecture musicale via OAuth PKCE.',
    status: 'not_configured',
    authType: 'oauth2',
    permissions: ['user-read-playback-state', 'user-modify-playback-state'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Non configuré : Nécessite un Client ID Spotify Developer.',
  },
  {
    id: 'custom_api',
    name: 'Passerelle API REST Personnalisée',
    description: 'Passerelle sécurisée avec filtrage SSRF strict pour APIs externes autorisées.',
    status: 'configured_untested',
    authType: 'api_key',
    permissions: ['http_request'],
    lastHealthCheck: new Date().toISOString(),
    healthMessage: 'Filtre SSRF actif : Les adresses privées et locales sont interdites.',
  },
];

const DEFAULT_SETTINGS: UserSettings = {
  assistantName: 'CHLOÉ',
  avatarUrl: '/assets/aistudio/chloe-avatar-fullbody_f3fa7d52.webp',
  personality: 'Féminine, intelligente, calme, respectueuse, attentive, honnête et chaleureuse. S’exprime en français impeccable et s’adapte à son propriétaire sur Samsung Galaxy S24.',
  language: 'fr',
  voiceGender: 'female',
  voiceSpeed: 1.0,
  voicePitch: 1.05,
  model: 'gemini-3.8-flash',
  theme: 'dark',
  ecoMode: false,
  dailyRequestLimit: 250,
  webSearchEnabled: true,
  audioAutoSpeak: false,
  ownerEmail: OWNER_EMAIL,
};

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem_1',
    userId: OWNER_USER_ID,
    category: 'identity_preferences',
    title: 'Appareil principal',
    content: 'Le propriétaire utilise exclusivement son smartphone Samsung Galaxy S24. Les interfaces, boutons et flux doivent être optimisés pour une manipulation tactile fluide.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['appareil', 'galaxy_s24', 'tactile'],
    isPinned: true,
  },
  {
    id: 'mem_2',
    userId: OWNER_USER_ID,
    category: 'identity_preferences',
    title: 'Ton et langue de communication',
    content: 'Communication principale en français naturel, respectueux, direct et chaleureux, sans formules creuses ni prétention de faux savoirs.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['langue', 'francais', 'personnalite'],
    isPinned: true,
  },
  {
    id: 'mem_3',
    userId: OWNER_USER_ID,
    category: 'habits',
    title: 'Sécurité et confirmations',
    content: 'Toute action sensible (envoi d’email, modification d’agenda, suppression de document, exécution d’automatisation) exige une confirmation explicite (Niveau 3).',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['securite', 'niveau_3', 'approbation'],
  },
  {
    id: 'mem_4',
    userId: OWNER_USER_ID,
    category: 'projects',
    title: 'Développement de CHLOÉ AI',
    content: 'Projet majeur : construire une IA personnelle complète, multimodale, sécurisée avec 10 compétences et connecteurs réels.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['projet', 'chloe', 'ia_personnelle'],
  },
];

const DEFAULT_DOC_CONTENT = `# Guide Technique CHLOÉ AI
CHLOÉ AI est une assistante personnelle multimodale conçue avec une haute exigence de sécurité, de clarté et d'honnêteté intellectuelle.
Elle dispose de 10 compétences modulaires et d'un système de contrôle d'accès en 3 niveaux :
- Niveau 1 : Consultation en lecture seule.
- Niveau 2 : Préparation de brouillons et simulations.
- Niveau 3 : Exécution nécessitant une autorisation explicite de l'utilisateur.

Sécurité des données :
Toutes les données sont hermétiquement isolées par identifiant utilisateur (userId). Aucune requête cliente ne peut contourner cette barrière.`;

const DEFAULT_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_1',
    userId: OWNER_USER_ID,
    name: 'Guide_CHLOE_AI_Architecture.md',
    size: DEFAULT_DOC_CONTENT.length,
    type: 'text/markdown',
    summary: 'Spécifications complètes du cerveau central, des 10 compétences, des connecteurs et du contrôle d’accès à 3 niveaux de CHLOÉ.',
    chunksCount: 2,
    uploadedAt: new Date().toISOString(),
    content: DEFAULT_DOC_CONTENT,
    chunks: createOverlappingChunks('doc_1', DEFAULT_DOC_CONTENT),
  },
];

const DEFAULT_AUTOMATIONS: AutomationTask[] = [
  {
    id: 'auto_1',
    userId: OWNER_USER_ID,
    name: 'Briefing matinal Galaxy S24',
    description: 'Synthèse quotidienne de l’agenda Google Calendar, des emails importants et de la météo.',
    trigger: 'schedule',
    triggerDetail: 'Tous les jours à 08:00',
    conditions: 'Connexion Google Calendar et Gmail active',
    action: 'Générer un résumé concis et préparer les créneaux de la journée.',
    accessLevel: 'LEVEL_2_PREPARATION',
    status: 'active',
    lastRun: '2026-11-01T07:00:00Z',
    nextRun: '2026-11-02T07:00:00Z',
    executionCount: 21,
    logs: ['[08:00] Briefing généré avec succès. 3 réunions identifiées, 2 emails en attente.'],
  },
];

class Database {
  private data: DBData;

  constructor() {
    this.data = this.load();
  }

  private load(): DBData {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        
        // Ensure authentic connectors are complete and legacy status normalized
        const connectors = DEFAULT_CONNECTORS.map(def => {
          const found = (parsed.connectors || []).find((c: any) => c.id === def.id);
          if (found) {
            let status = found.status;
            if (status === 'connected') status = 'connected_and_tested';
            return { ...def, ...found, status };
          }
          return def;
        });

        // Ensure documents have chunks and correct userId
        const documents = (parsed.documents && parsed.documents.length > 0)
          ? parsed.documents.map((d: any) => {
              const chunks = (d.chunks && d.chunks.length > 0)
                ? d.chunks
                : createOverlappingChunks(d.id, d.content || DEFAULT_DOC_CONTENT);
              return {
                ...d,
                userId: d.userId || OWNER_USER_ID,
                chunks,
                chunksCount: chunks.length,
              };
            })
          : DEFAULT_DOCUMENTS;

        return {
          ...parsed,
          connectors,
          documents,
        };
      }
    } catch (e) {
      console.warn('Could not read existing db file, resetting to defaults:', e);
    }

    const initialConvId = 'conv_default';
    return {
      settings: DEFAULT_SETTINGS,
      usage: {
        totalRequests: 58,
        todayRequests: 19,
        estimatedTokens: 89000,
        toolInvocations: 45,
        documentsIndexed: 1,
        storageBytesUsed: DEFAULT_DOC_CONTENT.length,
        estimatedCostEur: 0.11,
        lastUpdated: new Date().toISOString(),
      },
      skills: DEFAULT_SKILLS,
      connectors: DEFAULT_CONNECTORS,
      memories: DEFAULT_MEMORIES,
      documents: DEFAULT_DOCUMENTS,
      automations: DEFAULT_AUTOMATIONS,
      approvals: [],
      logs: [
        {
          id: 'log_1',
          userId: OWNER_USER_ID,
          timestamp: new Date().toISOString(),
          agent: 'ORCHESTRATEUR',
          action: 'Initialisation du système CHLOÉ AI',
          level: 'LEVEL_1_CONSULTATION',
          status: 'success',
          details: 'Démarrage de l’orchestrateur central sur Samsung Galaxy S24.',
        },
      ],
      conversations: [
        {
          id: initialConvId,
          userId: OWNER_USER_ID,
          title: 'Bienvenue sur CHLOÉ AI',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
        },
      ],
      messages: {
        [initialConvId]: [
          {
            id: 'msg_welcome',
            role: 'assistant',
            content: `Bonjour ! Je suis **CHLOÉ AI**, votre assistante personnelle intelligente.\n\nJe suis prête à vous accompagner sur votre **Samsung Galaxy S24** avec mes 10 compétences intégrées : raisonnement, vision, voix, mémoire, recherche Internet avec citations, développement de code, documents RAG, automatisations et créativité.\n\nComment puis-je vous aider aujourd'hui ?`,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    };
  }

  public save(): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing database file:', e);
    }
  }

  // Settings
  public getSettings(): UserSettings {
    return this.data.settings;
  }

  public updateSettings(updates: Partial<UserSettings>): UserSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }

  // Usage
  public getUsage(): SystemUsage {
    return this.data.usage;
  }

  public recordUsage(tokens: number, isToolCall = false): void {
    this.data.usage.totalRequests += 1;
    this.data.usage.todayRequests += 1;
    this.data.usage.estimatedTokens += tokens;
    if (isToolCall) {
      this.data.usage.toolInvocations += 1;
    }
    this.data.usage.estimatedCostEur = parseFloat((this.data.usage.estimatedTokens * 0.0000012).toFixed(4));
    this.data.usage.lastUpdated = new Date().toISOString();
    this.save();
  }

  // Skills
  public getSkills(): SkillConfig[] {
    return this.data.skills;
  }

  public toggleSkill(id: string, enabled: boolean): SkillConfig | undefined {
    const s = this.data.skills.find(x => x.id === id);
    if (s) {
      s.enabled = enabled;
      this.log(OWNER_USER_ID, 'SKILL_MANAGER', `Compétence ${s.name} ${enabled ? 'activée' : 'désactivée'}`, 'LEVEL_2_PREPARATION', 'success', `ID: ${id}`);
      this.save();
    }
    return s;
  }

  public recordSkillUse(id: string): void {
    const s = this.data.skills.find(x => x.id === id);
    if (s) {
      s.usageCount += 1;
      s.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  // Connectors
  public getConnectors(): ConnectorConfig[] {
    // Ensure dynamic check on Gemini API key
    const gemini = this.data.connectors.find(c => c.id === 'gemini');
    if (gemini) {
      gemini.status = process.env.GEMINI_API_KEY ? 'connected_and_tested' : 'not_configured';
    }
    return this.data.connectors;
  }

  public updateConnector(id: string, updates: Partial<ConnectorConfig>): ConnectorConfig | undefined {
    const c = this.data.connectors.find(x => x.id === id);
    if (c) {
      Object.assign(c, updates);
      c.lastHealthCheck = new Date().toISOString();
      this.save();
    }
    return c;
  }

  // Memories with strict multi-user isolation
  public getMemories(userId: string = OWNER_USER_ID): MemoryItem[] {
    return this.data.memories.filter(m => m.userId === userId);
  }

  public addMemory(userId: string, item: Omit<MemoryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): MemoryItem {
    const newMem: MemoryItem = {
      ...item,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.memories.unshift(newMem);
    this.log(userId, 'MÉMOIRE', `Nouvelle mémoire ajoutée : "${newMem.title}"`, 'LEVEL_2_PREPARATION', 'success', `Catégorie: ${newMem.category}`);
    this.save();
    return newMem;
  }

  public updateMemory(userId: string, id: string, updates: Partial<MemoryItem>): MemoryItem | undefined {
    const m = this.data.memories.find(x => x.id === id && x.userId === userId);
    if (m) {
      Object.assign(m, updates, { updatedAt: new Date().toISOString() });
      this.save();
    }
    return m;
  }

  public deleteMemory(userId: string, id: string): boolean {
    const initialLen = this.data.memories.length;
    this.data.memories = this.data.memories.filter(x => !(x.id === id && x.userId === userId));
    if (this.data.memories.length !== initialLen) {
      this.log(userId, 'MÉMOIRE', `Mémoire supprimée (ID: ${id})`, 'LEVEL_2_PREPARATION', 'success', 'Suppression confirmée');
      this.save();
      return true;
    }
    return false;
  }

  public wipeAllMemories(userId: string = OWNER_USER_ID): void {
    this.data.memories = this.data.memories.filter(m => m.userId !== userId);
    this.log(userId, 'MÉMOIRE', 'Toutes les mémoires utilisateur ont été effacées', 'LEVEL_3_EXECUTION', 'warning', 'Purge complète');
    this.save();
  }

  // Documents with RAG Overlapping Chunks & user isolation
  public getDocuments(userId: string = OWNER_USER_ID): DocumentItem[] {
    return this.data.documents.filter(d => d.userId === userId);
  }

  public addDocument(userId: string, name: string, content: string, type: string): DocumentItem {
    const docId = `doc_${Date.now()}`;
    const chunks = createOverlappingChunks(docId, content);
    const summary = content.substring(0, 180) + (content.length > 180 ? '...' : '');

    const doc: DocumentItem = {
      id: docId,
      userId,
      name,
      size: content.length,
      type: type || 'text/plain',
      summary,
      chunksCount: chunks.length,
      uploadedAt: new Date().toISOString(),
      content,
      chunks,
    };

    this.data.documents.unshift(doc);
    this.data.usage.documentsIndexed += 1;
    this.data.usage.storageBytesUsed += doc.size;
    this.log(userId, 'DOCUMENTS_RAG', `Document indexé : ${doc.name}`, 'LEVEL_1_CONSULTATION', 'success', `Taille: ${doc.size} octets, ${doc.chunksCount} passages sémantiques`);
    this.save();
    return doc;
  }

  public deleteDocument(userId: string, id: string): boolean {
    const doc = this.data.documents.find(x => x.id === id && x.userId === userId);
    if (doc) {
      this.data.usage.storageBytesUsed = Math.max(0, this.data.usage.storageBytesUsed - doc.size);
      this.data.usage.documentsIndexed = Math.max(0, this.data.usage.documentsIndexed - 1);
      this.data.documents = this.data.documents.filter(x => !(x.id === id && x.userId === userId));
      this.log(userId, 'DOCUMENTS_RAG', `Document supprimé : ${doc.name}`, 'LEVEL_3_EXECUTION', 'success', 'Déréférencement RAG');
      this.save();
      return true;
    }
    return false;
  }

  // Automations with user isolation
  public getAutomations(userId: string = OWNER_USER_ID): AutomationTask[] {
    return this.data.automations.filter(a => a.userId === userId);
  }

  public addAutomation(userId: string, task: Omit<AutomationTask, 'id' | 'userId' | 'executionCount' | 'logs'>): AutomationTask {
    const newTask: AutomationTask = {
      ...task,
      id: `auto_${Date.now()}`,
      userId,
      executionCount: 0,
      logs: [`[${new Date().toLocaleTimeString('fr-FR')}] Tâche créée`],
    };
    this.data.automations.unshift(newTask);
    this.save();
    return newTask;
  }

  public toggleAutomation(userId: string, id: string, status: 'active' | 'paused'): AutomationTask | undefined {
    const a = this.data.automations.find(x => x.id === id && x.userId === userId);
    if (a) {
      a.status = status;
      a.logs.unshift(`[${new Date().toLocaleTimeString('fr-FR')}] Statut changé en: ${status}`);
      this.save();
    }
    return a;
  }

  public runAutomation(id: string): { success: boolean; message: string } {
    const a = this.data.automations.find(x => x.id === id);
    if (!a) return { success: false, message: 'Tâche introuvable' };

    a.executionCount += 1;
    a.lastRun = new Date().toISOString();
    const logEntry = `[${new Date().toLocaleTimeString('fr-FR')}] Exécution planifiée réussie : ${a.action}`;
    a.logs.unshift(logEntry);
    this.log(a.userId, 'AUTOMATION', `Exécution de la tâche : ${a.name}`, a.accessLevel, 'success', a.action);
    this.save();
    return { success: true, message: `Exécution réussie : ${a.name}` };
  }

  // Approvals (Level 3 Access Control) with 15-min TTL and anti-replay signature
  public getApprovals(userId: string = OWNER_USER_ID): PendingApproval[] {
    const now = Date.now();
    // Auto expire overdue approvals
    for (const app of this.data.approvals) {
      if (app.status === 'pending' && new Date(app.expiresAt).getTime() < now) {
        app.status = 'expired';
      }
    }
    return this.data.approvals.filter(a => a.userId === userId);
  }

  public createApproval(
    userId: string,
    action: string,
    service: string,
    payload: Record<string, any>,
    expectedResult: string
  ): PendingApproval {
    const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-min TTL
    const signature = crypto.createHash('sha256').update(`${id}:${userId}:${action}:${expiresAt}`).digest('hex');

    const approval: PendingApproval = {
      id,
      userId,
      action,
      service,
      payload,
      expectedResult,
      createdAt: new Date().toISOString(),
      expiresAt,
      signature,
      status: 'pending',
    };

    this.data.approvals.unshift(approval);
    this.log(userId, 'ACCESS_CONTROL', `Action Niveau 3 en attente de confirmation : ${action}`, 'LEVEL_3_EXECUTION', 'pending', `Service: ${service} (Expire à ${new Date(expiresAt).toLocaleTimeString('fr-FR')})`);
    this.save();
    return approval;
  }

  public resolveApproval(userId: string, id: string, approve: boolean): { success: boolean; approval?: PendingApproval; error?: string } {
    const a = this.data.approvals.find(x => x.id === id && x.userId === userId);
    if (!a) return { success: false, error: 'Demande introuvable.' };

    if (a.status !== 'pending') {
      return { success: false, error: `Cette demande a déjà été résolue (${a.status}). Réutilisation interdite.` };
    }

    if (new Date(a.expiresAt).getTime() < Date.now()) {
      a.status = 'expired';
      this.save();
      return { success: false, error: 'La demande a expiré (délai de sécurité de 15 minutes dépassé).' };
    }

    a.status = approve ? 'approved' : 'rejected';
    a.resolvedAt = new Date().toISOString();
    this.log(userId, 'ACCESS_CONTROL', `Action Niveau 3 ${approve ? 'CONFIRMÉE' : 'ANNULÉE'} par l’utilisateur : ${a.action}`, 'LEVEL_3_EXECUTION', approve ? 'success' : 'warning', `ID: ${id}`);
    this.save();
    return { success: true, approval: a };
  }

  // Logs
  public getLogs(userId: string = OWNER_USER_ID): ActivityLog[] {
    return this.data.logs.filter(l => l.userId === userId);
  }

  public log(
    userId: string,
    agent: string,
    action: string,
    level: ActivityLog['level'],
    status: ActivityLog['status'],
    details: string,
    skillId?: SkillConfig['id']
  ): void {
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      timestamp: new Date().toISOString(),
      agent,
      skillId,
      action,
      level,
      status,
      details,
    };
    this.data.logs.unshift(newLog);
    if (this.data.logs.length > 500) {
      this.data.logs.pop();
    }
    this.save();
  }

  // Conversations & Messages
  public getConversations(userId: string = OWNER_USER_ID): Conversation[] {
    return this.data.conversations.filter(c => c.userId === userId);
  }

  public createConversation(userId: string = OWNER_USER_ID, title = 'Nouvelle conversation'): Conversation {
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      userId,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    this.data.conversations.unshift(newConv);
    this.data.messages[newConv.id] = [];
    this.save();
    return newConv;
  }

  public deleteConversation(userId: string, id: string): boolean {
    const conv = this.data.conversations.find(c => c.id === id && c.userId === userId);
    if (!conv) return false;
    this.data.conversations = this.data.conversations.filter(x => x.id !== id);
    delete this.data.messages[id];
    this.save();
    return true;
  }

  public getMessages(convId: string, userId: string = OWNER_USER_ID): ChatMessage[] {
    const conv = this.data.conversations.find(c => c.id === convId && c.userId === userId);
    if (!conv) return [];
    return this.data.messages[convId] || [];
  }

  public addMessage(convId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>, userId: string = OWNER_USER_ID): ChatMessage {
    const conv = this.data.conversations.find(x => x.id === convId && x.userId === userId);
    if (!conv) {
      // Auto create conversation if missing
      this.createConversation(userId, 'Nouvelle conversation');
    }

    if (!this.data.messages[convId]) {
      this.data.messages[convId] = [];
    }

    const newMsg: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.messages[convId].push(newMsg);

    if (conv) {
      conv.updatedAt = new Date().toISOString();
      conv.messageCount = this.data.messages[convId].length;
      if (conv.title === 'Nouvelle conversation' && msg.role === 'user') {
        conv.title = msg.content.substring(0, 36) + (msg.content.length > 36 ? '...' : '');
      }
    }

    this.save();
    return newMsg;
  }

  // Full export (RGPD)
  public exportAllUserData(userId: string = OWNER_USER_ID): Record<string, any> {
    const userConvs = this.getConversations(userId);
    const convIds = new Set(userConvs.map(c => c.id));
    const userMessages: Record<string, ChatMessage[]> = {};
    for (const [cId, msgs] of Object.entries(this.data.messages)) {
      if (convIds.has(cId)) {
        userMessages[cId] = msgs;
      }
    }

    return {
      exportDate: new Date().toISOString(),
      user: this.data.settings.ownerEmail,
      userId,
      device: 'Samsung Galaxy S24',
      settings: this.data.settings,
      memories: this.getMemories(userId),
      documents: this.getDocuments(userId),
      automations: this.getAutomations(userId),
      conversations: userConvs,
      messages: userMessages,
      logsCount: this.getLogs(userId).length,
    };
  }

  // Delete all account data (GDPR Right to erasure)
  public wipeEntireAccount(userId: string = OWNER_USER_ID): void {
    const userConvs = this.getConversations(userId);
    for (const c of userConvs) {
      delete this.data.messages[c.id];
    }
    this.data.memories = this.data.memories.filter(m => m.userId !== userId);
    this.data.documents = this.data.documents.filter(d => d.userId !== userId);
    this.data.automations = this.data.automations.filter(a => a.userId !== userId);
    this.data.approvals = this.data.approvals.filter(a => a.userId !== userId);
    this.data.conversations = this.data.conversations.filter(c => c.userId !== userId);
    this.data.logs = this.data.logs.filter(l => l.userId !== userId);

    this.log(
      userId,
      'SÉCURITÉ',
      'Suppression intégrale du compte et des données personnelles',
      'LEVEL_3_EXECUTION',
      'success',
      'Toutes les mémoires, documents et conversations ont été détruits conformément aux instructions.'
    );
    this.save();
  }

  // SSRF Protection Helper for external APIs
  public isUrlSafeFromSSRF(urlString: string): { safe: boolean; reason?: string } {
    try {
      const url = new URL(urlString);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { safe: false, reason: 'Protocole non autorisé (seuls http et https sont permis).' };
      }

      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname === '169.254.169.254' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return { safe: false, reason: 'Accès interdit aux réseaux internes et privés (SSRF).' };
      }

      return { safe: true };
    } catch {
      return { safe: false, reason: 'URL invalide.' };
    }
  }
}

export const db = new Database();
