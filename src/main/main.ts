import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  excludedSections: string[];
}

interface AISettings {
  provider: 'ollama' | 'mistral';
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
    provider: 'ollama',
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

// AI operations
ipcMain.handle('ai:analyze', async (_, content: string, context: { h1: string; h2: string; allH2s: string[] }) => {
  const settings = loadSettings();

  const systemPrompt = `You are a research assistant analyzing academic notes. Your task is to provide concise, actionable feedback with CONCRETE SUGGESTIONS that can be directly inserted into the notes.

The user is working on research about: "${context.h1}"
Current section focus: "${context.h2}"
All sections in this note: ${context.allH2s.join(', ')}

Analyze the provided content and generate feedback in the following categories:
1. MECE (Mutually Exclusive, Collectively Exhaustive) - Are categories well-organized? What's missing?
2. GAPS - What aspects, considerations, or perspectives are not addressed?
3. SOURCES - What types of literature or domains should be explored?
4. STRUCTURE - How could the organization be improved?

IMPORTANT: For each feedback item, provide a "suggestion" field with CONCRETE TEXT that the user can directly insert into their notes. This should be actual content they can use, not just advice.

Respond in JSON format:
{
  "feedback": [
    {
      "type": "mece" | "gap" | "source" | "structure",
      "text": "Brief explanation of the issue (1 sentence)",
      "suggestion": "The actual text/content to add. For structure suggestions, provide the new headings. For gaps, provide the missing content as a starting point. For sources, provide specific recommendations. Make this insertable text."
    }
  ]
}

Examples of good suggestions:
- For MECE: "## Technical Limitations\\n\\n## Ethical Considerations\\n\\n## Economic Impact"
- For GAP: "Consider the environmental impact: LLMs require significant computational resources, raising concerns about energy consumption and carbon footprint."
- For SOURCE: "Key references to explore:\\n- 'Attention Is All You Need' (Vaswani et al., 2017)\\n- Stanford AI Index Report\\n- MIT Technology Review on LLM applications"
- For STRUCTURE: "## 1. Definition and Background\\n\\n## 2. Current Applications\\n\\n## 3. Limitations\\n\\n## 4. Future Directions"

Keep explanations brief but make suggestions detailed and directly usable.`;

  const userPrompt = `Please analyze this research note section:\n\n${content}`;

  try {
    if (settings.provider === 'ollama') {
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
        return JSON.parse(data.response);
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
        return JSON.parse(data.choices[0].message.content);
      } catch {
        return { feedback: [] };
      }
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    return { feedback: [], error: 'AI analysis failed. Check your settings.' };
  }
});

ipcMain.handle('ai:checkConnection', async () => {
  const settings = loadSettings();

  try {
    if (settings.provider === 'ollama') {
      const response = await fetch(`${settings.ollamaUrl}/api/tags`);
      return response.ok;
    } else {
      // For Mistral, just check if API key is set
      return !!settings.mistralApiKey;
    }
  } catch {
    return false;
  }
});
