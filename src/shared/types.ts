export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  excludedSections: string[];
}

// Custom feedback type configuration
export interface FeedbackTypeConfig {
  id: string;           // Unique identifier (e.g., 'gap', 'mece', 'custom1')
  label: string;        // Display label (e.g., 'Gap', 'MECE')
  description: string;  // What this feedback type checks for
  color: string;        // Hex color for the badge (e.g., '#60a5fa')
  enabled: boolean;     // Whether to include in analysis
}

// Prompt configuration
export interface PromptConfig {
  systemPrompt: string;           // The main system prompt template
  feedbackTypes: FeedbackTypeConfig[];  // Configurable feedback types
}

export interface AISettings {
  provider: 'builtin' | 'ollama' | 'mistral';
  ollamaModel: string;
  ollamaUrl: string;
  mistralApiKey: string;
  spellcheckEnabled: boolean;
  spellcheckLanguages: string[];
  chunkingThresholdMs: number; // Response time threshold for adaptive chunking (ms)
  // Built-in LLM configuration
  llmContextSize: number;   // Context window size (default: 2048)
  llmMaxTokens: number;     // Max tokens to generate (default: 1024)
  llmBatchSize: number;     // Batch size for inference (default: 512)
  // Prompt configuration
  promptConfig: PromptConfig;
}

export interface SpellcheckLanguage {
  code: string;
  name: string;
}

export interface AIContext {
  h1: string;
  h2: string;
  allH2s: string[];
}

export interface FeedbackItem {
  id: string;
  type: string;  // Now accepts any custom type
  text: string;
  suggestion?: string;
  relevantText?: string;
  status: 'active' | 'accepted' | 'rejected';
  sectionId?: string;
}

export interface AIResponse {
  feedback: Omit<FeedbackItem, 'id' | 'status'>[];
  error?: string;
}

// Default feedback types (built-in)
export type DefaultFeedbackType = 'mece' | 'gap' | 'source' | 'structure';

// Default colors for built-in types
export const DEFAULT_FEEDBACK_COLORS: Record<DefaultFeedbackType, { bg: string; text: string; border: string }> = {
  mece: { bg: '#2d1f3d', text: '#c084fc', border: '#7c3aed' },
  gap: { bg: '#1f2d3d', text: '#60a5fa', border: '#2563eb' },
  source: { bg: '#1f3d2d', text: '#4ade80', border: '#16a34a' },
  structure: { bg: '#3d2d1f', text: '#fbbf24', border: '#d97706' },
};

// Default labels for built-in types
export const DEFAULT_FEEDBACK_LABELS: Record<DefaultFeedbackType, string> = {
  mece: 'MECE',
  gap: 'Gap',
  source: 'Source',
  structure: 'Structure',
};

// Default feedback type configurations
export const DEFAULT_FEEDBACK_TYPES: FeedbackTypeConfig[] = [
  {
    id: 'gap',
    label: 'Gap',
    description: 'Missing information, perspectives, or analysis that should be added',
    color: '#60a5fa',
    enabled: true,
  },
  {
    id: 'mece',
    label: 'MECE',
    description: 'Categories that are not mutually exclusive or collectively exhaustive',
    color: '#c084fc',
    enabled: true,
  },
  {
    id: 'source',
    label: 'Source',
    description: 'Missing citations, references, or empirical evidence',
    color: '#4ade80',
    enabled: true,
  },
  {
    id: 'structure',
    label: 'Structure',
    description: 'Organization, flow, or formatting improvements needed',
    color: '#fbbf24',
    enabled: true,
  },
];

// Default system prompt template
export const DEFAULT_SYSTEM_PROMPT = `You are a research assistant helping improve academic notes on "{{topic}}".
Current section: "{{section}}"
Other sections in the document: {{otherSections}}

Your task: Analyze the notes and provide SPECIFIC, ACTIONABLE feedback with DETAILED suggestions.

Feedback types:
{{feedbackTypes}}

IMPORTANT: Your suggestions must contain ACTUAL CONTENT that can be directly inserted into the notes. Do NOT write generic placeholders like "Add more details" or "Include subsection A". Instead, write the actual paragraphs, analysis, or content.

Example of a GOOD response:
{"feedback":[{"type":"gap","text":"The analysis lacks discussion of economic implications.","suggestion":"The economic impact of this development includes rising costs of supply chain restructuring, estimated at $500B globally. Companies are diversifying manufacturing to Vietnam, India, and Mexico, though this 'friend-shoring' approach increases production costs by 15-20%. The long-term economic equilibrium remains uncertain as nations balance security concerns against efficiency."}]}

Example of a BAD response (do NOT do this):
{"feedback":[{"type":"structure","text":"Needs better organization.","suggestion":"Add a section header. Include subsection A and B."}]}

Provide 2-3 feedback items. Output ONLY valid JSON:`;
