import { contextBridge, ipcRenderer } from 'electron';
import { LLMRequest, LLMResponse, EnvCheckResponse } from './types';

contextBridge.exposeInMainWorld('api', {
    checkEnv: async (): Promise<EnvCheckResponse> => {
        return await ipcRenderer.invoke('env:check');
    },
    askLLM: async ({ provider, theme, history }: LLMRequest): Promise<LLMResponse> => {
        return await ipcRenderer.invoke('llm:ask', { provider, theme, history });
    },
}); 