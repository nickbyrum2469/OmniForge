const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniforgeDesktop', Object.freeze({
  isDesktop: true,
  chooseProjectDirectory: options => ipcRenderer.invoke('omniforge:choose-project-directory', options || {}),
  openPath: target => ipcRenderer.invoke('omniforge:open-path', target),
  showItemInFolder: target => ipcRenderer.invoke('omniforge:show-item', target),
  copyText: value => ipcRenderer.invoke('omniforge:copy-text', String(value ?? '')),
  getLifecycleInfo: () => ipcRenderer.invoke('omniforge:lifecycle-info'),
  relaunchSafeMode: () => ipcRenderer.invoke('omniforge:relaunch-safe-mode'),
  relaunchNormal: () => ipcRenderer.invoke('omniforge:relaunch-normal')
}));
