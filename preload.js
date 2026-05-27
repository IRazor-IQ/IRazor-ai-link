const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe AndroidCompilerBridge-compatible API to the renderer (index.html)
contextBridge.exposeInMainWorld('AndroidCompilerBridge', {
  // ── Core API ────────────────────────────────────────────────────────────────
  readFile:          (p)             => ipcRenderer.invoke('bridge-readFile', p),
  writeFile:         (p, b64)        => ipcRenderer.invoke('bridge-writeFile', p, b64),
  listDir:           (p)             => ipcRenderer.invoke('bridge-listDir', p),
  listDirRecursive:  (p, d)          => ipcRenderer.invoke('bridge-listDirRecursive', p, d),
  executeShell:      (cmd)           => ipcRenderer.invoke('bridge-executeShell', cmd),
  searchInFiles:     (d, pat, max)   => ipcRenderer.invoke('bridge-searchInFiles', d, pat, max),
  deleteFile:        (p)             => ipcRenderer.invoke('bridge-deleteFile', p),
  createDir:         (p)             => ipcRenderer.invoke('bridge-createDir', p),
  openFilePicker:    ()              => ipcRenderer.invoke('bridge-openFilePicker'),
  saveFilePicker:    (name, b64)     => ipcRenderer.invoke('bridge-saveFilePicker', name, b64),

  // ── Settings stubs (match Android API) ──────────────────────────────────────
  getApiKey:   () => localStorage.getItem('custom_api_key') || '',
  setApiKey:   (k) => { localStorage.setItem('custom_api_key', k); return true; },
  getApiUrl:   () => 'https://opencode.ai/zen/v1/chat/completions',
  getVersion:  () => '5.0',
  getDevice:   () => require('os').hostname(),
  isOnline:    () => navigator.onLine,
  toast:       (msg) => { /* handled by index.html */ },
});
