const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    checkEnv: async () => {
        return await ipcRenderer.invoke('env:check');
    },
    askLLM: async ({ provider, theme, history }) => {
        return await ipcRenderer.invoke('llm:ask', { provider, theme, history });
    },
});