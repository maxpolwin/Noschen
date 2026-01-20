import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  initializeLocalLLM,
  generateLocalResponse,
  checkLocalLLMAvailable,
  disposeLocalLLM,
  truncateToTokenBudget,
  getLocalLLMStatus,
} from './llm/localLLM';

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
}

const NOTES_DIR = path.join(app.getPath('userData'), 'notes');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function ensureDirectories() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }
}

function getDefaultSettings(): AISettings {
  return {
    provider: 'builtin',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    mistralApiKey: '',
  };
}

function loadSettings(): AISettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return getDefaultSettings();
}

function saveSettings(settings: AISettings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Try common dev server ports
    const ports = [5173, 5174, 5175, 3000];
    let loaded = false;

    for (const port of ports) {
      try {
        await mainWindow.loadURL(`http://localhost:${port}`);
        console.log(`Loaded dev server on port ${port}`);
        loaded = true;
        break;
      } catch {
        console.log(`Port ${port} not available, trying next...`);
      }
    }

    if (!loaded) {
      console.error('Could not connect to dev server');
    }

    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  ensureDirectories();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Note operations
ipcMain.handle('notes:list', async () => {
  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.json'));
  const notes: Note[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8');
      notes.push(JSON.parse(content));
    } catch (error) {
      console.error(`Failed to read note ${file}:`, error);
    }
  }

  return notes.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

ipcMain.handle('notes:get', async (_, id: string) => {
  const filePath = path.join(NOTES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
});

ipcMain.handle('notes:create', async () => {
  const note: Note = {
    id: uuidv4(),
    title: 'Untitled Note',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    excludedSections: [],
  };

  fs.writeFileSync(
    path.join(NOTES_DIR, `${note.id}.json`),
    JSON.stringify(note, null, 2)
  );

  return note;
});

ipcMain.handle('notes:save', async (_, note: Note) => {
  note.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(NOTES_DIR, `${note.id}.json`),
    JSON.stringify(note, null, 2)
  );
  return note;
});

ipcMain.handle('notes:delete', async (_, id: string) => {
  const filePath = path.join(NOTES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

ipcMain.handle('notes:search', async (_, query: string) => {
  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.json'));
  const results: Note[] = [];
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8');
      const note: Note = JSON.parse(content);
      if (
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery)
      ) {
        results.push(note);
      }
    } catch (error) {
      console.error(`Failed to search note ${file}:`, error);
    }
  }

  return results.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

// Settings operations
ipcMain.handle('settings:get', async () => {
  return loadSettings();
});

ipcMain.handle('settings:save', async (_, settings: AISettings) => {
  saveSettings(settings);
  return settings;
});

// Helper function for Mistral API calls (used as fallback)
async function callMistralAPI(apiKey: string, systemPrompt: string, userPrompt: string) {
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error('Mistral request failed');
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(data.choices[0].message.content);
    return ensureSuggestions(parsed);
  } catch (error) {
    console.error('[AI] Mistral API fallback failed:', error);
    return { feedback: [], error: 'Mistral API fallback failed' };
  }
}

// AI operations - optimized prompts for different model sizes
const PROMPTS = {
  // Compact prompt for small edge models (Qwen 0.5B, Phi3-mini, etc.)
  small: {
    system: (ctx: { h1: string; h2: string; allH2s: string[] }) => `You analyze research notes and give JSON feedback.
Topic: "${ctx.h1}"
Section: "${ctx.h2}"
Other sections: ${ctx.allH2s.slice(0, 5).join(', ')}

Output JSON only:
{"feedback":[{"type":"gap|mece|source","text":"issue","suggestion":"2-3 sentences to add"}]}`,
    maxContentTokens: 800,
  },
  // Full prompt for larger models (Ollama, Mistral API)
  large: {
    system: (ctx: { h1: string; h2: string; allH2s: string[] }) => `You are a research assistant analyzing academic notes. Provide feedback with CONCRETE, INSERTABLE CONTENT.

Research topic: "${ctx.h1}"
Current section: "${ctx.h2}"
Existing sections: ${ctx.allH2s.join(', ')}

Analyze the content and provide feedback. Every feedback item MUST include a "suggestion" field with actual insertable text.

Categories: MECE (missing categories), GAP (missing perspectives), SOURCE (literature), STRUCTURE (organization)

JSON FORMAT:
{"feedback":[{"type":"gap","text":"Brief description","suggestion":"2-5 sentences of actual content to insert."}]}`,
    maxContentTokens: 2000,
  },
};

// Extract current section content for focused analysis
function extractCurrentSection(content: string, currentH2: string): string {
  if (!currentH2) return content;

  // Split by H2 headings and find the current section
  const h2Pattern = /(?=##\s+[^#])|(?=<h2[^>]*>)/gi;
  const sections = content.split(h2Pattern);

  for (const section of sections) {
    if (section.toLowerCase().includes(currentH2.toLowerCase())) {
      return section;
    }
  }

  // If not found, return the last portion of content
  return content.slice(-2000);
}

ipcMain.handle('ai:analyze', async (_, content: string, context: { h1: string; h2: string; allH2s: string[] }) => {
  const settings = loadSettings();

  // Determine if using small or large model
  const isSmallModel = settings.provider === 'builtin';
  const promptConfig = isSmallModel ? PROMPTS.small : PROMPTS.large;

  // For small models, extract only the current section
  let analysisContent = content;
  if (isSmallModel) {
    analysisContent = extractCurrentSection(content, context.h2);
    // Truncate to fit token budget
    analysisContent = truncateToTokenBudget(analysisContent, promptConfig.maxContentTokens);
  }

  const systemPrompt = promptConfig.system(context);
  const userPrompt = `Analyze:\n\n${analysisContent}`;

  try {
    if (settings.provider === 'builtin') {
      // Use built-in local LLM with better error handling
      const availability = await checkLocalLLMAvailable();
      if (!availability.available) {
        console.error('[AI] Local model not available:', availability.error);
        return { feedback: [], error: availability.error };
      }

      const initResult = await initializeLocalLLM();
      if (!initResult.success) {
        console.error('[AI] Failed to initialize local LLM:', initResult.error);
        return { feedback: [], error: initResult.error };
      }

      console.log('[AI] Generating response with local model...');
      const result = await generateLocalResponse(systemPrompt, userPrompt);

      if (result.error) {
        console.error('[AI] Local LLM generation error:', result.error);
        // Graceful fallback: if Mistral API key exists, try that
        if (settings.mistralApiKey) {
          console.log('[AI] Falling back to Mistral API...');
          return await callMistralAPI(settings.mistralApiKey, PROMPTS.large.system(context), `Analyze:\n\n${content}`);
        }
        return { feedback: [], error: result.error };
      }

      // Try to extract JSON from the response
      try {
        const jsonMatch = result.response?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return ensureSuggestions(parsed);
        }
        console.warn('[AI] No JSON found in response:', result.response?.slice(0, 200));
        return { feedback: [] };
      } catch (parseError) {
        console.error('[AI] Failed to parse local LLM response:', result.response?.slice(0, 200));
        return { feedback: [] };
      }
    } else if (settings.provider === 'ollama') {
      const response = await fetch(`${settings.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel,
          prompt: `${systemPrompt}\n\nUser: ${userPrompt}`,
          stream: false,
          format: 'json',
        }),
      });

      if (!response.ok) {
        throw new Error('Ollama request failed');
      }

      const data = await response.json() as { response: string };
      try {
        const parsed = JSON.parse(data.response);
        return ensureSuggestions(parsed);
      } catch {
        return { feedback: [] };
      }
    } else {
      // Mistral API fallback
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.mistralApiKey}`,
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error('Mistral request failed');
      }

      const data = await response.json() as { choices: { message: { content: string } }[] };
      try {
        const parsed = JSON.parse(data.choices[0].message.content);
        return ensureSuggestions(parsed);
      } catch {
        return { feedback: [] };
      }
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    return { feedback: [], error: 'AI analysis failed. Check your settings.' };
  }
});

// Helper function to ensure all feedback items have suggestions
function ensureSuggestions(response: { feedback?: Array<{ type: string; text: string; suggestion?: string }> }) {
  if (!response.feedback || !Array.isArray(response.feedback)) {
    return { feedback: [] };
  }

  const suggestionTemplates: Record<string, (text: string) => string> = {
    mece: (text) => `## Additional Category\n\n${text}\n\nConsider exploring this aspect in more detail.`,
    gap: (text) => `${text}\n\nThis perspective could strengthen the analysis by providing a more comprehensive view of the topic.`,
    source: (text) => `### Recommended Sources\n\n${text}\n\n- Consider searching Google Scholar for related academic papers\n- Look for recent review articles in this domain`,
    structure: (text) => `## Suggested Section\n\n${text}\n\n### Subsection A\n\n### Subsection B`,
  };

  response.feedback = response.feedback.map((item) => {
    if (!item.suggestion || item.suggestion.trim() === '') {
      const template = suggestionTemplates[item.type] || suggestionTemplates.gap;
      item.suggestion = template(item.text);
    }
    return item;
  });

  return response;
}

ipcMain.handle('ai:checkConnection', async () => {
  const settings = loadSettings();

  try {
    if (settings.provider === 'builtin') {
      const availability = await checkLocalLLMAvailable();
      if (!availability.available) {
        console.log('[AI] Local model not available:', availability.error);
        return false;
      }
      // Try to initialize the model
      const initResult = await initializeLocalLLM();
      return initResult.success;
    } else if (settings.provider === 'ollama') {
      const response = await fetch(`${settings.ollamaUrl}/api/tags`);
      return response.ok;
    } else {
      // For Mistral, just check if API key is set
      return !!settings.mistralApiKey;
    }
  } catch (error) {
    console.error('[AI] Connection check failed:', error);
    return false;
  }
});

// Get detailed LLM status for debugging
ipcMain.handle('ai:getStatus', async () => {
  const settings = loadSettings();
  const status = getLocalLLMStatus();

  return {
    provider: settings.provider,
    localLLM: status,
    modelPath: settings.provider === 'builtin' ? 'qwen2.5-0.5b-instruct-q4_k_m.gguf' : null,
  };
});

// Cleanup on app quit
app.on('before-quit', async () => {
  await disposeLocalLLM();
});
