const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  flashWindow: (enable) => ipcRenderer.send('flash-window', enable),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isDesktop: true
});
