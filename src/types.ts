export interface Message {
    role: 'user' | 'chatgpt' | 'gemini' | 'system';
    content: string;
    t: number;
}

export interface LLMRequest {
    provider: 'chatgpt' | 'gemini';
    theme: string;
    history: Message[];
}

export interface LLMResponse {
    ok: boolean;
    text?: string;
    error?: string;
}

export interface EnvCheckResponse {
    hasOpenAI: boolean;
    hasGemini: boolean;
}

export interface PromptParams {
    theme: string;
    history: Message[];
    speaker: 'chatgpt' | 'gemini';
}

export interface WindowAPI {
    checkEnv: () => Promise<EnvCheckResponse>;
    askLLM: (request: LLMRequest) => Promise<LLMResponse>;
}

declare global {
    interface Window {
        api: WindowAPI;
    }
} 