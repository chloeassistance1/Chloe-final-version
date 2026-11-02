import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { AIProviderId, AIProviderConfig } from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KEYS_FILE = path.join(DATA_DIR, 'ai_providers.json');

interface StoredProviderData {
  activeProvider: AIProviderId;
  activeModel: string;
  keys: {
    gemini?: string;
    openai?: string;
    nvidia?: string;
    openrouter?: string;
  };
  selectedModels: {
    gemini: string;
    openai: string;
    nvidia: string;
    openrouter: string;
  };
}

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o',
  nvidia: 'meta/llama-3.3-70b-instruct',
  openrouter: 'deepseek/deepseek-r1',
};

const PROVIDER_METADATA: Record<AIProviderId, { name: string; endpoint: string; description: string; keyUrl: string; models: string[] }> = {
  gemini: {
    name: 'Google Gemini',
    endpoint: 'Google GenAI Cloud',
    description: 'Modèle multimodal officiel Google avec raisonnement et recherche Google Grounding.',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    models: ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-flash-lite'],
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    description: 'Modèles phares OpenAI GPT-4o, GPT-4o Mini et série o3-mini.',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4.5-preview'],
  },
  nvidia: {
    name: 'NVIDIA NIM (build.nvidia.com)',
    endpoint: 'https://integrate.api.nvidia.com/v1',
    description: 'Microservices NVIDIA NIM accélérés par GPU (Llama 3.3, Mistral Large, DeepSeek R1).',
    keyUrl: 'https://build.nvidia.com',
    models: [
      'meta/llama-3.3-70b-instruct',
      'mistralai/mistral-large-2-instruct',
      'deepseek-ai/deepseek-r1',
      'nvidia/llama-3.1-nemotron-70b-instruct',
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    description: 'Passerelle universelle unifiée avec accès à Claude 3.5, DeepSeek R1, Llama et Gemini.',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      'deepseek/deepseek-r1',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o',
    ],
  },
};

class ProviderManager {
  private data: StoredProviderData;

  constructor() {
    this.data = this.loadData();
    // Auto-detect environment variables
    if (!this.data.keys.gemini && process.env.GEMINI_API_KEY) {
      this.data.keys.gemini = process.env.GEMINI_API_KEY;
    }
    if (!this.data.keys.openai && process.env.OPENAI_API_KEY) {
      this.data.keys.openai = process.env.OPENAI_API_KEY;
    }
    if (!this.data.keys.nvidia && process.env.NVIDIA_API_KEY) {
      this.data.keys.nvidia = process.env.NVIDIA_API_KEY;
    }
    if (!this.data.keys.openrouter && process.env.OPENROUTER_API_KEY) {
      this.data.keys.openrouter = process.env.OPENROUTER_API_KEY;
    }
  }

  private loadData(): StoredProviderData {
    try {
      if (fs.existsSync(KEYS_FILE)) {
        const raw = fs.readFileSync(KEYS_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Impossible de charger les clés fournisseurs:', e);
    }
    return {
      activeProvider: 'gemini',
      activeModel: DEFAULT_MODELS.gemini,
      keys: {
        gemini: process.env.GEMINI_API_KEY || '',
      },
      selectedModels: { ...DEFAULT_MODELS },
    };
  }

  private saveData(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(KEYS_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Erreur sauvegarde clés:', e);
    }
  }

  private maskKey(key?: string): string {
    if (!key) return '';
    const clean = key.trim();
    if (clean.length <= 8) return '••••••••';
    return clean.substring(0, 4) + '••••••••' + clean.substring(clean.length - 4);
  }

  public getProvidersInfo(): {
    activeProvider: AIProviderId;
    activeModel: string;
    providers: AIProviderConfig[];
  } {
    const list: AIProviderConfig[] = (['gemini', 'openai', 'nvidia', 'openrouter'] as AIProviderId[]).map(id => {
      const meta = PROVIDER_METADATA[id];
      const key = this.data.keys[id] || (id === 'gemini' ? process.env.GEMINI_API_KEY : '');
      const hasKey = !!(key && key.trim().length > 5);
      return {
        id,
        name: meta.name,
        endpoint: meta.endpoint,
        description: meta.description,
        keyUrl: meta.keyUrl,
        hasKey,
        maskedKey: this.maskKey(key),
        status: hasKey ? 'connected' : 'not_configured',
        models: meta.models,
        selectedModel: this.data.selectedModels[id] || DEFAULT_MODELS[id],
      };
    });

    return {
      activeProvider: this.data.activeProvider,
      activeModel: this.data.activeModel,
      providers: list,
    };
  }

  public setProviderKey(id: AIProviderId, key: string): { success: boolean; maskedKey: string } {
    this.data.keys[id] = key.trim();
    this.saveData();
    return {
      success: true,
      maskedKey: this.maskKey(key),
    };
  }

  public removeProviderKey(id: AIProviderId): { success: boolean } {
    delete this.data.keys[id];
    this.saveData();
    return { success: true };
  }

  public setActiveProvider(id: AIProviderId, model?: string): void {
    this.data.activeProvider = id;
    if (model) {
      this.data.selectedModels[id] = model;
      this.data.activeModel = model;
    } else {
      this.data.activeModel = this.data.selectedModels[id] || DEFAULT_MODELS[id];
    }
    this.saveData();
  }

  public setProviderModel(id: AIProviderId, model: string): void {
    this.data.selectedModels[id] = model;
    if (this.data.activeProvider === id) {
      this.data.activeModel = model;
    }
    this.saveData();
  }

  public getKey(id: AIProviderId): string {
    const k = this.data.keys[id];
    if (k && k.trim()) return k.trim();
    if (id === 'gemini') return process.env.GEMINI_API_KEY || '';
    if (id === 'openai') return process.env.OPENAI_API_KEY || '';
    if (id === 'nvidia') return process.env.NVIDIA_API_KEY || '';
    if (id === 'openrouter') return process.env.OPENROUTER_API_KEY || '';
    return '';
  }

  public getAvailableAlternativeProvider(): AIProviderId | null {
    const list: AIProviderId[] = ['openai', 'nvidia', 'openrouter'];
    for (const p of list) {
      if (this.getKey(p)) return p;
    }
    return null;
  }

  public async testProvider(id: AIProviderId): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const key = this.getKey(id);
    if (!key) {
      return { success: false, message: `Aucune clé API configurée pour ${PROVIDER_METADATA[id].name}.`, latencyMs: 0 };
    }

    const start = Date.now();
    try {
      if (id === 'gemini') {
        const g = new GoogleGenAI({ apiKey: key });
        const res = await g.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'Réponds uniquement "OK".',
        });
        const lat = Date.now() - start;
        return {
          success: true,
          message: `Connexion Google Gemini réussie (${lat}ms). Modèle actif: gemini-3.8-flash.`,
          latencyMs: lat,
        };
      }

      let endpoint = '';
      let testModel = '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      };

      if (id === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        testModel = 'gpt-4o-mini';
      } else if (id === 'nvidia') {
        endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
        testModel = 'meta/llama-3.3-70b-instruct';
      } else if (id === 'openrouter') {
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        testModel = 'deepseek/deepseek-r1';
        headers['HTTP-Referer'] = 'https://chloe.ai';
        headers['X-Title'] = 'CHLOE AI Personal Assistant';
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Ping. Réponds "PONG".' }],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const lat = Date.now() - start;

      if (!resp.ok) {
        const errText = await resp.text();
        return {
          success: false,
          message: `Erreur HTTP ${resp.status} de ${PROVIDER_METADATA[id].name} : ${errText.substring(0, 100)}`,
          latencyMs: lat,
        };
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || 'OK';
      return {
        success: true,
        message: `Connexion ${PROVIDER_METADATA[id].name} réussie (${lat}ms). Réponse : "${reply.trim().substring(0, 30)}".`,
        latencyMs: lat,
      };
    } catch (e: any) {
      const lat = Date.now() - start;
      return {
        success: false,
        message: `Échec du test ${PROVIDER_METADATA[id].name} : ${e.message || 'Délai d’attente dépassé.'}`,
        latencyMs: lat,
      };
    }
  }

  public async generateChatCompletion(params: {
    systemPrompt: string;
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    image?: string;
  }): Promise<{ text: string; providerUsed: AIProviderId; modelUsed: string }> {
    const provider = this.data.activeProvider || 'gemini';
    const key = this.getKey(provider);
    const model = this.data.selectedModels[provider] || DEFAULT_MODELS[provider];

    // If active provider is gemini, handled by standard gemini service or fallback
    if (provider === 'gemini' || !key) {
      return {
        text: '',
        providerUsed: 'gemini',
        modelUsed: model,
      };
    }

    let endpoint = '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    };

    if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (provider === 'nvidia') {
      endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
    } else if (provider === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      headers['HTTP-Referer'] = 'https://chloe.ai';
      headers['X-Title'] = 'CHLOE AI';
    }

    const formattedMessages: any[] = [{ role: 'system', content: params.systemPrompt }];
    for (const m of params.messages) {
      if (params.image && m.role === 'user' && m === params.messages[params.messages.length - 1]) {
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: params.image } },
          ],
        });
      } else {
        formattedMessages.push({ role: m.role, content: m.content });
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erreur ${PROVIDER_METADATA[provider].name} (${res.status}): ${err.substring(0, 150)}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || '';
    return {
      text,
      providerUsed: provider,
      modelUsed: model,
    };
  }
}

export const providerManager = new ProviderManager();
