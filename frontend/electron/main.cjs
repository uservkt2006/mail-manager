const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const http = require('http')

const ICON_PATH = fs.existsSync(path.join(__dirname, '..', '..', 'build', 'icon.png'))
  ? path.join(__dirname, '..', '..', 'build', 'icon.png')
  : path.join(__dirname, '..', '..', 'build', 'icon.ico')

let mainWindow = null
let backendProcess = null

// Resolve paths in both dev and packaged mode
function appRoot() {
  // In packaged: resources/app/, app.asar
  // In dev: frontend/
  return app.isPackaged ? path.join(process.resourcesPath) : path.join(__dirname, '..', '..')
}

function resolvePython() {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(appRoot(), 'backend', '.venv', 'Scripts', 'python.exe'),
      path.join(process.resourcesPath || '', 'app', 'backend', '.venv', 'Scripts', 'python.exe'),
    ]
    for (const p of candidates) if (fs.existsSync(p)) return p
  } else {
    const candidates = [
      path.join(appRoot(), 'backend', '.venv', 'bin', 'python'),
      path.join(process.resourcesPath || '', 'app', 'backend', '.venv', 'bin', 'python'),
      '/usr/bin/python3',
    ]
    for (const p of candidates) if (fs.existsSync(p)) return p
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function resolveBackendScript() {
  const candidates = [
    path.join(appRoot(), 'backend', 'app.py'),
    path.join(process.resourcesPath || '', 'app', 'backend', 'app.py'),
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return null
}

function resolveFrontendDist() {
  const candidates = [
    path.join(__dirname, '..', 'dist'),
    path.join(process.resourcesPath || '', 'app', 'dist'),
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return null
}

function startBackend() {
  const pythonPath = resolvePython()
  const backendScript = resolveBackendScript()
  if (!backendScript) {
    console.error('Backend script not found')
    return null
  }
  console.log('Starting backend:', pythonPath, backendScript)
  backendProcess = spawn(pythonPath, [backendScript], {
    cwd: path.dirname(backendScript),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MM_DEMO: '0',
      PORT: '18685'
    }
  })
  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('error', err => console.error('Backend spawn error:', err))
  backendProcess.on('exit', code => console.log('Backend exited with code', code))
  return backendProcess
}

function waitForBackend(port = 18685, attempts = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0
    const check = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 }, res => {
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.on('timeout', () => { req.destroy(); retry() })
    }
    const retry = () => {
      if (++tries >= attempts) return reject(new Error('Backend not responding'))
      setTimeout(check, 500)
    }
    check()
  })
}

// Tiny static + /api proxy server (replaces scripts/serve.py)
function startProxy(backendPort = 18685, frontendPort = 5174) {
  const distDir = resolveFrontendDist()
  if (!distDir) { console.error('dist/ not found'); return null }

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2'
  }

  const server = http.createServer((req, res) => {
    // Proxy /api/* → backend
    if (req.url.startsWith('/api/')) {
      const proxyReq = http.request({
        hostname: '127.0.0.1', port: backendPort, path: req.url,
        method: req.method, headers: req.headers
      }, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })
      proxyReq.on('error', () => {
        res.writeHead(502); res.end(JSON.stringify({error: 'backend down'}))
      })
      req.pipe(proxyReq)
      return
    }
    // Serve frontend dist (SPA fallback to index.html)
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html')
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  })

  server.listen(frontendPort, '127.0.0.1', () => {
    console.log(`Proxy+frontend on http://127.0.0.1:${frontendPort}`)
  })
  return server
}

async function createWindow() {
  const winOpts = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c0e12',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    show: false,
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

  if (process.platform === 'linux' && fs.existsSync(ICON_PATH)) {
    try { mainWindow.setIcon(ICON_PATH) } catch {}
  }

  const isDev = !app.isPackaged
  const frontendPort = process.env.FRONTEND_PORT || 5174
  const backendPort = process.env.BACKEND_PORT || 18685

  if (isDev) {
    startBackend()
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173')
      mainWindow.show()
    }, 2500)
  } else {
    startBackend()
    startProxy(backendPort, frontendPort)
    try {
      await waitForBackend(backendPort)
      console.log('Backend ready, loading frontend')
      mainWindow.loadURL(`http://127.0.0.1:${frontendPort}`)
      mainWindow.show()
    } catch (e) {
      console.error('Backend startup failed:', e.message)
      mainWindow.show()
      mainWindow.loadURL(`data:text/html,<html><body style='background:#0c0e12;color:#ff6b6b;font-family:sans-serif;padding:40px;'><h2>Backend startup failed</h2><p>${e.message}</p><p>Check ~/.mail_manager/ logs and Python venv at backend/.venv</p></body></html>`)
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (backendProcess) backendProcess.kill()
  })
}

function installLinuxDesktopEntry() {
  if (process.platform !== 'linux') return
  try {
    const home = require('os').homedir()
    const applicationsDir = path.join(home, '.local', 'share', 'applications')
    fs.mkdirSync(applicationsDir, { recursive: true })
    const exePath = process.execPath
    const desktopFile = path.join(applicationsDir, 'mail-manager.desktop')
    const iconRef = fs.existsSync(ICON_PATH) ? ICON_PATH : 'mail-manager'
    fs.writeFileSync(desktopFile,
      `[Desktop Entry]
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
`, { mode: 0o644 })
  } catch (e) {
    console.error('Failed to install .desktop entry:', e)
  }
}

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
