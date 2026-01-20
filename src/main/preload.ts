import { contextBridge, ipcRenderer } from 'electron';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  excludedSections: string[];
}

interface AISettings {
  provider: 'builtin' | 'ollama' | 'mistral';
  ollamaModel: string;
  ollamaUrl: string;
  mistralApiKey: string;
  spellcheckEnabled: boolean;
  spellcheckLanguages: string[];
}

interface SpellcheckLanguage {
  code: string;
  name: string;
}

interface LLMStatus {
  provider: string;
  localLLM: {
    initialized: boolean;
    initializing: boolean;
    error: string | null;
  };
  modelPath: string | null;
}

interface AIContext {
  h1: string;
  h2: string;
  allH2s: string[];
}

interface FeedbackItem {
  type: 'mece' | 'gap' | 'source' | 'structure';
  text: string;
  relevantText?: string;
}

interface AIResponse {
  feedback: FeedbackItem[];
  error?: string;
}

const api = {
  notes: {
    list: (): Promise<Note[]> => ipcRenderer.invoke('notes:list'),
    get: (id: string): Promise<Note | null> => ipcRenderer.invoke('notes:get', id),
    create: (): Promise<Note> => ipcRenderer.invoke('notes:create'),
    save: (note: Note): Promise<Note> => ipcRenderer.invoke('notes:save', note),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('notes:delete', id),
    search: (query: string): Promise<Note[]> => ipcRenderer.invoke('notes:search', query),
  },
  settings: {
    get: (): Promise<AISettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: AISettings): Promise<AISettings> => ipcRenderer.invoke('settings:save', settings),
  },
  ai: {
    analyze: (content: string, context: AIContext): Promise<AIResponse> =>
      ipcRenderer.invoke('ai:analyze', content, context),
    checkConnection: (): Promise<boolean> => ipcRenderer.invoke('ai:checkConnection'),
    getStatus: (): Promise<LLMStatus> => ipcRenderer.invoke('ai:getStatus'),
  },
  spellcheck: {
    getAvailableLanguages: (): Promise<SpellcheckLanguage[]> =>
      ipcRenderer.invoke('spellcheck:getAvailableLanguages'),
    getCurrentLanguages: (): Promise<string[]> =>
      ipcRenderer.invoke('spellcheck:getCurrentLanguages'),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type API = typeof api;
