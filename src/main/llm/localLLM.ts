import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app } from 'electron';

// Force real ESM dynamic import (bypasses TypeScript's CommonJS transformation)
// This is necessary because node-llama-cpp v3.x is ESM-only with top-level await
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

// State management
let llamaModule: any = null;
let llama: any = null;
let model: any = null;
let context: any = null;
let isInitialized = false;
let isInitializing = false;
let initError: string | null = null;
let lastInitAttempt = 0;

// Detect Apple Silicon for Metal acceleration
function isAppleSilicon(): boolean {
  return process.platform === 'darwin' && os.arch() === 'arm64';
}

// Get optimal GPU layers for the platform
function getOptimalGpuLayers(): number {
  if (isAppleSilicon()) {
    // Enable Metal acceleration on Apple Silicon
    // For Qwen 0.5B Q4_K_M, 33 layers is typical for full GPU offload
    return 33;
  }
  // CPU-only for other platforms (or set to positive number for CUDA/ROCm)
  return 0;
}

// Configuration for small models
const MODEL_CONFIG = {
  contextSize: 2048, // Small context for edge models
  maxTokens: 512,    // Limit output for speed
  temperature: 0.7,
  batchSize: 512,
  gpuLayers: getOptimalGpuLayers(),
};

// Retry configuration
const INIT_RETRY_DELAY = 5000; // 5 seconds between retry attempts

function getModelPath(): string {
  const isDev = !app.isPackaged;
  const modelName = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';

  if (isDev) {
    return path.join(process.cwd(), 'models', modelName);
  } else {
    return path.join(process.resourcesPath, 'models', modelName);
  }
}

export async function checkLocalLLMAvailable(): Promise<{ available: boolean; error?: string }> {
  const modelPath = getModelPath();

  if (!fs.existsSync(modelPath)) {
    return {
      available: false,
      error: `Model file not found: ${modelPath}. Run: npm run download-model`,
    };
  }

  const stats = fs.statSync(modelPath);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB < 100) {
    return {
      available: false,
      error: 'Model file appears corrupted (too small). Re-download with: npm run download-model',
    };
  }

  return { available: true };
}

export async function initializeLocalLLM(): Promise<{ success: boolean; error?: string }> {
  // Prevent concurrent initialization
  if (isInitializing) {
    return { success: false, error: 'Initialization already in progress' };
  }

  // Return cached result if recently attempted
  if (initError && Date.now() - lastInitAttempt < INIT_RETRY_DELAY) {
    return { success: false, error: initError };
  }

  // Already initialized
  if (isInitialized && model && context) {
    return { success: true };
  }

  isInitializing = true;
  lastInitAttempt = Date.now();

  try {
    // Check model availability first
    const availability = await checkLocalLLMAvailable();
    if (!availability.available) {
      throw new Error(availability.error);
    }

    const modelPath = getModelPath();
    console.log('[LocalLLM] Initializing with model:', modelPath);

    // Dynamic import for ESM module (using dynamicImport to bypass CommonJS transformation)
    if (!llamaModule) {
      console.log('[LocalLLM] Loading node-llama-cpp module...');
      llamaModule = await dynamicImport('node-llama-cpp');
    }

    const { getLlama } = llamaModule;

    // Initialize llama runtime
    if (!llama) {
      console.log('[LocalLLM] Initializing llama runtime...');
      llama = await getLlama();
    }

    // Load model with GPU acceleration where available
    const gpuLayers = MODEL_CONFIG.gpuLayers;
    console.log(`[LocalLLM] Loading model with ${gpuLayers} GPU layers (Metal: ${isAppleSilicon()})...`);
    model = await llama.loadModel({
      modelPath,
      gpuLayers, // Metal acceleration on Apple Silicon, CPU on others
    });

    // Create context
    console.log('[LocalLLM] Creating context...');
    context = await model.createContext({
      contextSize: MODEL_CONFIG.contextSize,
    });

    isInitialized = true;
    initError = null;
    console.log('[LocalLLM] Initialization complete');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
    console.error('[LocalLLM] Initialization failed:', errorMessage);
    initError = errorMessage;
    isInitialized = false;

    // Clean up partial state
    await disposeLocalLLM();

    return { success: false, error: errorMessage };
  } finally {
    isInitializing = false;
  }
}

export async function generateLocalResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<{ response?: string; error?: string }> {
  // Ensure initialized
  if (!isInitialized || !model || !context) {
    const initResult = await initializeLocalLLM();
    if (!initResult.success) {
      return { error: initResult.error };
    }
  }

  try {
    const { LlamaChatSession } = llamaModule;

    // Create a fresh session for this request
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt,
    });

    console.log('[LocalLLM] Generating response...');
    const startTime = Date.now();

    const response = await session.prompt(userPrompt, {
      maxTokens: MODEL_CONFIG.maxTokens,
      temperature: MODEL_CONFIG.temperature,
    });

    const duration = Date.now() - startTime;
    console.log(`[LocalLLM] Response generated in ${duration}ms`);

    return { response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Generation failed';
    console.error('[LocalLLM] Generation error:', errorMessage);

    // Reset state on critical errors
    if (errorMessage.includes('context') || errorMessage.includes('model')) {
      await disposeLocalLLM();
    }

    return { error: errorMessage };
  }
}

export async function disposeLocalLLM(): Promise<void> {
  console.log('[LocalLLM] Disposing...');

  try {
    if (context) {
      await context.dispose();
    }
  } catch (e) {
    console.error('[LocalLLM] Error disposing context:', e);
  }

  try {
    if (model) {
      await model.dispose();
    }
  } catch (e) {
    console.error('[LocalLLM] Error disposing model:', e);
  }

  context = null;
  model = null;
  isInitialized = false;
  console.log('[LocalLLM] Disposed');
}

export function getLocalLLMStatus(): {
  initialized: boolean;
  initializing: boolean;
  error: string | null;
  gpuAcceleration: {
    enabled: boolean;
    type: string;
    layers: number;
  };
} {
  const gpuEnabled = MODEL_CONFIG.gpuLayers > 0;
  return {
    initialized: isInitialized,
    initializing: isInitializing,
    error: initError,
    gpuAcceleration: {
      enabled: gpuEnabled,
      type: isAppleSilicon() ? 'Metal (Apple Silicon)' : (gpuEnabled ? 'GPU' : 'CPU'),
      layers: MODEL_CONFIG.gpuLayers,
    },
  };
}

// Utility: Estimate token count (rough approximation)
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

// Utility: Truncate text to fit within token budget
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate proportionally
  const ratio = maxTokens / estimatedTokens;
  const targetLength = Math.floor(text.length * ratio * 0.9); // 10% safety margin
  return text.substring(0, targetLength) + '...';
}
