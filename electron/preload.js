'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startAuth:  ()         => ipcRenderer.invoke('auth:start'),
  authStatus: ()         => ipcRenderer.invoke('auth:status'),
  signOut:    ()         => ipcRenderer.invoke('auth:signout'),
});
