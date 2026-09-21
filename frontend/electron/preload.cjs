const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // native folder picker (Outlook-style "Browse") — resolves to a path or null
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  // desktop notification like Outlook's new-mail toast
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  // open an email in a separate Electron window (Outlook "open in new window")
  openMailWindow: (mailId, subject) => ipcRenderer.invoke('open-mail-window', { mailId, subject }),
  // auto-update: download .deb to /tmp + pkexec dpkg -i (Linux only)
  installUpdate: (args) => ipcRenderer.invoke('install-update', args),
  platform: process.platform,
})
