// src/utils/constants.ts
import { ModelDefinition } from '../types';

export const AVAILABLE_MODELS: ModelDefinition[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini Pro', provider: 'gemini' },
  { id: 'gpt-4-turbo', name: 'OpenAI GPT-4 Turbo', provider: 'openai', isMock: true },
  { id: 'claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet', provider: 'anthropic', isMock: true },
];
