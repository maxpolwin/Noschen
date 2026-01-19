export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  excludedSections: string[];
}

export interface AISettings {
  provider: 'ollama' | 'mistral';
  ollamaModel: string;
  ollamaUrl: string;
  mistralApiKey: string;
}

export interface AIContext {
  h1: string;
  h2: string;
  allH2s: string[];
}

export interface FeedbackItem {
  id: string;
  type: 'mece' | 'gap' | 'source' | 'structure';
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

export type FeedbackType = 'mece' | 'gap' | 'source' | 'structure';

export const FEEDBACK_COLORS: Record<FeedbackType, { bg: string; text: string; border: string }> = {
  mece: { bg: '#2d1f3d', text: '#c084fc', border: '#7c3aed' },
  gap: { bg: '#1f2d3d', text: '#60a5fa', border: '#2563eb' },
  source: { bg: '#1f3d2d', text: '#4ade80', border: '#16a34a' },
  structure: { bg: '#3d2d1f', text: '#fbbf24', border: '#d97706' },
};

export const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  mece: 'MECE',
  gap: 'Gap',
  source: 'Source',
  structure: 'Structure',
};
