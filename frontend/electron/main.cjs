const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const ICON_PATH = fs.existsSync(path.join(__dirname, '..', '..', 'build', 'icon.png'))
  ? path.join(__dirname, '..', '..', 'build', 'icon.png')
  : path.join(__dirname, '..', '..', 'build', 'icon.ico')

let mainWindow
let backendProcess
let proxyProcess

function resolvePython() {
  if (process.platform === 'win32') {
    const winPath = path.join(__dirname, '..', '..', 'backend', '.venv', 'Scripts', 'python.exe')
    if (fs.existsSync(winPath)) return winPath
  }
  const linuxPath = path.join(__dirname, '..', '..', 'backend', '.venv', 'bin', 'python')
  if (fs.existsSync(linuxPath)) return linuxPath
  return process.platform === 'win32' ? 'python' : 'python3'
}

function createWindow() {
  const winOpts = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0e12',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, frame: false }
      : { autoHideMenuBar: true }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  }

  mainWindow = new BrowserWindow(winOpts)

  // Set Linux dock / Unity launcher icon
  if (process.platform === 'linux' && fs.existsSync(ICON_PATH)) {
    try { mainWindow.setIcon(ICON_PATH) } catch {}
  }

  const isDev = !app.isPackaged

  if (isDev) {
    const pythonPath = resolvePython()
    const backendScript = path.join(__dirname, '..', '..', 'backend', 'app.py')

    backendProcess = spawn(pythonPath, [backendScript], {
      cwd: path.join(__dirname, '..', '..', 'backend'),
      stdio: 'ignore',
      env: { ...process.env, MM_DEMO: '0' }
    })
    backendProcess.on('error', (err) => console.error('Backend error:', err))

    setTimeout(() => mainWindow.loadURL('http://localhost:5173'), 2000)
  } else {
    const pythonPath = resolvePython()
    const backendScript = path.join(__dirname, '..', '..', 'backend', 'app.py')
    const backendPort = process.env.BACKEND_PORT || 18685
    const frontendPort = process.env.FRONTEND_PORT || 5174

    backendProcess = spawn(pythonPath, [backendScript], {
      cwd: path.join(__dirname, '..', '..', 'backend'),
      stdio: 'ignore',
      env: { ...process.env, MM_DEMO: '0', PORT: String(backendPort) }
    })
    backendProcess.on('error', (err) => console.error('Backend error:', err))

    setTimeout(() => {
      const { spawn: spawnSync } = require('child_process')
      const serveScript = path.join(__dirname, '..', '..', 'scripts', 'serve.py')
      proxyProcess = spawnSync(pythonPath, [serveScript, String(frontendPort)], {
        stdio: 'ignore',
        env: { ...process.env, MM_API_TARGET: `http://127.0.0.1:${backendPort}` }
      })
      proxyProcess.on('error', (err) => console.error('Proxy error:', err))

      mainWindow.loadURL(`http://localhost:${frontendPort}`)
    }, 3000)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (backendProcess) backendProcess.kill()
  })
}

// Linux: install .desktop entry with icon for AppImage integration
function installLinuxDesktopEntry() {
  if (process.platform !== 'linux') return
  try {
    const home = require('os').homedir()
    const applicationsDir = path.join(home, '.local', 'share', 'applications')
    fs.mkdirSync(applicationsDir, { recursive: true })

    const exePath = process.execPath
    const desktopFile = path.join(applicationsDir, 'mail-manager.desktop')
    const iconRef = fs.existsSync(ICON_PATH) ? ICON_PATH : 'mail-manager'

    const content = `[Desktop Entry]
Version=1.0
Type=Application
Name=Mail Manager
Comment=Desktop email client
Exec=${exePath} %u
Icon=${iconRef}
Terminal=false
Categories=Office;Network;Email;
StartupNotify=true
StartupWMClass=Mail Manager
`
    fs.writeFileSync(desktopFile, content, { mode: 0o644 })
  } catch (e) {
    console.error('Failed to install .desktop entry:', e)
  }
}

// Single-instance lock so subsequent launches focus existing window
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    installLinuxDesktopEntry()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill()
    if (proxyProcess) proxyProcess.kill()
    if (process.platform !== 'darwin') app.quit()
  })
}

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow && mainWindow.close())

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục lưu trữ',
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
    n.show()
  }
})
