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

// LLM configuration interface
export interface LLMConfig {
  contextSize: number;
  maxTokens: number;
  batchSize: number;
}

// Default configuration for small models
const DEFAULT_CONFIG: LLMConfig = {
  contextSize: 2048,
  maxTokens: 1536,  // Increased for detailed responses
  batchSize: 512,
};

// Static config (not user-configurable)
const STATIC_CONFIG = {
  temperature: 0.7,
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

// Get the import path for node-llama-cpp.
// In packaged apps, ESM import() from inside the asar can't resolve native
// binaries in @node-llama-cpp/* packages. Import from the unpacked directory
// so all internal imports also resolve from outside the asar.
function getNodeLlamaCppImportPath(): string {
  if (!app.isPackaged) {
    return 'node-llama-cpp';
  }
  const unpackedEntry = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'node-llama-cpp',
    'dist',
    'index.js'
  );
  return `file://${unpackedEntry}`;
}

// In the packaged app, node-llama-cpp is loaded from app.asar.unpacked so
// native binaries resolve correctly. But its JS dependencies (fs-extra,
// universalify, etc.) remain inside the asar. Add the asar's node_modules
// as a fallback module resolution path so require() can still find them.
function ensureAsarModuleResolution(): void {
  if (!app.isPackaged) return;
  const asarNodeModules = path.join(process.resourcesPath, 'app.asar', 'node_modules');
  const Module = require('module');
  if (!Module.globalPaths.includes(asarNodeModules)) {
    Module.globalPaths.push(asarNodeModules);
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
  if (isInitialized && model) {
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
      ensureAsarModuleResolution();
      const importPath = getNodeLlamaCppImportPath();
      console.log('[LocalLLM] Loading node-llama-cpp module from:', importPath);
      llamaModule = await dynamicImport(importPath);
    }

    const { getLlama } = llamaModule;

    // Initialize llama runtime
    if (!llama) {
      console.log('[LocalLLM] Initializing llama runtime...');
      llama = await getLlama();
    }

    // Load model with GPU acceleration where available
    const gpuLayers = STATIC_CONFIG.gpuLayers;
    console.log(`[LocalLLM] Loading model with ${gpuLayers} GPU layers (Metal: ${isAppleSilicon()})...`);
    model = await llama.loadModel({
      modelPath,
      gpuLayers, // Metal acceleration on Apple Silicon, CPU on others
    });

    // Note: Context is created fresh for each generation to avoid sequence exhaustion
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
  userPrompt: string,
  config?: Partial<LLMConfig>
): Promise<{ response?: string; error?: string }> {
  // Merge provided config with defaults
  const llmConfig = { ...DEFAULT_CONFIG, ...config };

  // Ensure initialized
  if (!isInitialized || !model) {
    const initResult = await initializeLocalLLM();
    if (!initResult.success) {
      return { error: initResult.error };
    }
  }

  let localContext: any = null;
  let session: any = null;

  try {
    const { LlamaChatSession } = llamaModule;

    // Create a fresh context for each request to avoid sequence exhaustion
    console.log(`[LocalLLM] Creating context (size: ${llmConfig.contextSize}, maxTokens: ${llmConfig.maxTokens})...`);
    localContext = await model.createContext({
      contextSize: llmConfig.contextSize,
    });

    // Get a sequence from the fresh context
    const contextSequence = localContext.getSequence();

    // Create a session for this request
    session = new LlamaChatSession({
      contextSequence,
      systemPrompt: systemPrompt,
    });

    console.log('[LocalLLM] Generating response...');
    const startTime = Date.now();

    const response = await session.prompt(userPrompt, {
      maxTokens: llmConfig.maxTokens,
      temperature: STATIC_CONFIG.temperature,
    });

    const duration = Date.now() - startTime;
    console.log(`[LocalLLM] Response generated in ${duration}ms`);

    return { response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Generation failed';
    console.error('[LocalLLM] Generation error:', errorMessage);
    return { error: errorMessage };
  } finally {
    // Dispose of session and context to free resources
    try {
      if (session) {
        await session.dispose?.();
      }
    } catch (e) {
      // Ignore
    }
    try {
      if (localContext) {
        await localContext.dispose?.();
      }
    } catch (e) {
      // Ignore
    }
  }
}

export async function disposeLocalLLM(): Promise<void> {
  console.log('[LocalLLM] Disposing...');

  try {
    if (model) {
      await model.dispose();
    }
  } catch (e) {
    console.error('[LocalLLM] Error disposing model:', e);
  }

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
  const gpuEnabled = STATIC_CONFIG.gpuLayers > 0;
  return {
    initialized: isInitialized,
    initializing: isInitializing,
    error: initError,
    gpuAcceleration: {
      enabled: gpuEnabled,
      type: isAppleSilicon() ? 'Metal (Apple Silicon)' : (gpuEnabled ? 'GPU' : 'CPU'),
      layers: STATIC_CONFIG.gpuLayers,
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
