import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('scratchEngineManager', {
  listVariations: () => ipcRenderer.invoke('list-variations'),
});
