import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// Use any types for dynamically imported ESM module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llama: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = null;
let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

function getModelPath(): string {
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(process.cwd(), 'models', 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  } else {
    return path.join(process.resourcesPath, 'models', 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  }
}

async function loadLlamaModule() {
  if (!llamaModule) {
    // Dynamic import for ESM module
    llamaModule = await import('node-llama-cpp');
  }
  return llamaModule;
}

export async function initializeLocalLLM(): Promise<boolean> {
  if (initPromise) {
    return initPromise;
  }

  if (isInitialized && model && context) {
    return true;
  }

  initPromise = (async () => {
    try {
      const modelPath = getModelPath();

      if (!fs.existsSync(modelPath)) {
        console.error('Model file not found:', modelPath);
        console.error('Please run: npm run download-model');
        return false;
      }

      console.log('Initializing local LLM with model:', modelPath);

      // Load the ESM module dynamically
      const mod = await loadLlamaModule();
      const { getLlama, LlamaChatSession } = mod;

      // Initialize llama
      llama = await getLlama();

      // Load the model
      model = await llama.loadModel({
        modelPath,
      });

      // Create context
      context = await model.createContext({
        contextSize: 2048,
      });

      // Create a chat session
      session = new LlamaChatSession({
        contextSequence: context.getSequence(),
      });

      isInitialized = true;
      console.log('Local LLM initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize local LLM:', error);
      isInitialized = false;
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function generateLocalResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!isInitialized || !session || !context || !model) {
    const success = await initializeLocalLLM();
    if (!success) {
      throw new Error('Local LLM not initialized. Model file may be missing.');
    }
  }

  try {
    const mod = await loadLlamaModule();
    const { LlamaChatSession } = mod;

    // Create a new session for each request
    session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt,
    });

    // Generate response
    const response = await session.prompt(userPrompt, {
      maxTokens: 1024,
      temperature: 0.7,
    });

    return response;
  } catch (error) {
    console.error('Local LLM generation failed:', error);
    throw error;
  }
}

export async function checkLocalLLMAvailable(): Promise<boolean> {
  const modelPath = getModelPath();
  return fs.existsSync(modelPath);
}

export async function disposeLocalLLM(): Promise<void> {
  try {
    if (context) {
      await context.dispose();
      context = null;
    }
    if (model) {
      await model.dispose();
      model = null;
    }
    session = null;
    isInitialized = false;
    console.log('Local LLM disposed');
  } catch (error) {
    console.error('Error disposing local LLM:', error);
  }
}

export function isLocalLLMInitialized(): boolean {
  return isInitialized;
}
