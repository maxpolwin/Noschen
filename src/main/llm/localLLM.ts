import { getLlama, LlamaChatSession, LlamaModel, LlamaContext } from 'node-llama-cpp';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

let llama: Awaited<ReturnType<typeof getLlama>> | null = null;
let model: LlamaModel | null = null;
let context: LlamaContext | null = null;
let session: LlamaChatSession | null = null;
let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

function getModelPath(): string {
  // In development, use the models folder in project root
  // In production, use the extraResources folder
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(process.cwd(), 'models', 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  } else {
    return path.join(process.resourcesPath, 'models', 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  }
}

export async function initializeLocalLLM(): Promise<boolean> {
  // Return existing promise if already initializing
  if (initPromise) {
    return initPromise;
  }

  // Return true if already initialized
  if (isInitialized && model && context) {
    return true;
  }

  initPromise = (async () => {
    try {
      const modelPath = getModelPath();

      // Check if model file exists
      if (!fs.existsSync(modelPath)) {
        console.error('Model file not found:', modelPath);
        console.error('Please run: npm run download-model');
        return false;
      }

      console.log('Initializing local LLM with model:', modelPath);

      // Initialize llama
      llama = await getLlama();

      // Load the model
      model = await llama.loadModel({
        modelPath,
      });

      // Create context with reasonable settings for the small model
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
    // Reset the session for a fresh conversation
    if (session) {
      // Create a new session for each request to avoid context buildup
      session = new LlamaChatSession({
        contextSequence: context!.getSequence(),
        systemPrompt: systemPrompt,
      });
    }

    // Generate response
    const response = await session!.prompt(userPrompt, {
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
}

export function isLocalLLMInitialized(): boolean {
  return isInitialized;
}
