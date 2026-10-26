import type { AiProviderId } from '@/types/ai';

export interface AiProviderMeta {
  id: AiProviderId;
  name: string;
  model: string;
  tagline: string;
  speed: string;
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    tagline: 'High-performance visual reasoning and instruction following',
    speed: '~1.4s'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    model: 'gemini-3.8-flash',
    tagline: 'Google multimodal reasoning for complex fleet diagnostics',
    speed: '~1.8s'
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    model: 'qwen/qwen3.8-27b',
    tagline: 'Ultra-fast LPU inference engine for rapid copilot replies',
    speed: '~300ms'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    model: 'pixtral-12b-2409',
    tagline: 'High-accuracy instruction and document extraction model',
    speed: '~1.2s'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'openrouter/free',
    tagline: 'Multi-model distributed gateway for resilient failover',
    speed: '~1.5s'
  }
];

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  nvidia: 'NVIDIA NIM',
  gemini: 'Google Gemini',
  groq: 'Groq Cloud',
  mistral: 'Mistral AI',
  openrouter: 'OpenRouter'
};

export const PROVIDER_TAGLINE: Record<AiProviderId, string> = {
  nvidia: 'High-performance visual reasoning and instruction following',
  gemini: 'Google multimodal reasoning for complex fleet diagnostics',
  groq: 'Ultra-fast LPU inference engine for rapid copilot replies',
  mistral: 'High-accuracy instruction and document extraction model',
  openrouter: 'Multi-model distributed gateway for resilient failover'
};
