import type { AiProviderId } from '@/types/ai';

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  gemini: 'Google Gemini',
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter',
  groq: 'Groq Cloud',
  mistral: 'Mistral AI'
};

export const PROVIDER_TAGLINE: Record<AiProviderId, string> = {
  gemini: 'Google multimodal reasoning',
  nvidia: 'Fast hosted Nemotron models',
  openrouter: 'Multi-model gateway for resilient failover',
  groq: 'Ultra-fast LPU inference',
  mistral: 'Accurate instruction and vision models'
};
