const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow
let backendProcess

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0e12',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, frame: false }
      : { autoHideMenuBar: true }),   // Linux/Win: normal frame so the window stays movable
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  // Load backend and frontend
  const isDev = !app.isPackaged
  
  if (isDev) {
    // Start backend
    const pythonPath = process.platform === 'win32'
      ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', '..', 'backend', '.venv', 'bin', 'python')

    const backendScript = path.join(__dirname, '..', '..', 'backend', 'app.py')

    backendProcess = spawn(pythonPath, [backendScript], {
      cwd: path.join(__dirname, '..', '..', 'backend'),
      stdio: 'ignore',
      env: { ...process.env, MM_DEMO: '0' }
    })
    
    backendProcess.on('error', (err) => console.error('Backend error:', err))
    
    // Wait for backend to be ready
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173')
    }, 2000)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (backendProcess) backendProcess.kill()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

// Titlebar controls
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.close())

// Native folder picker (Outlook "Browse for folder")
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục lưu trữ',
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled ? null : r.filePaths[0]
})

// Desktop new-mail notification (Outlook toast). Click focuses the window.
ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
    n.show()
  }
})
