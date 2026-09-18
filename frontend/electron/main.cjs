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
  // Packaged: project dir is one level above app.asar (resources/app/)
  // Dev: project dir is parent of frontend/
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app')
  }
  return path.join(__dirname, '..', '..')
}

function resolvePython() {
  const isWin = process.platform === 'win32'
  // 1. Try platform-specific embedded Python in extraResources
  const embedded = isWin
    ? path.join(process.resourcesPath || '', 'python-win', 'python.exe')
    : path.join(process.resourcesPath || '', 'python-linux', 'bin', 'python3')
  if (fs.existsSync(embedded)) return embedded

  // 2. Fallback: bundled Python in app.asar (older builds)
  const bundled = isWin
    ? path.join(appRoot(), 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(appRoot(), 'backend', '.venv', 'bin', 'python')
  if (fs.existsSync(bundled)) return bundled

  // 3. Try system Python
  if (isWin) return 'python'
  const systemPy = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3'
  return systemPy
}

function resolveBackendScript() {
  // For packaged apps, backend scripts are in extraResources/backend (outside app.asar)
  const candidates = [
    path.join(process.resourcesPath || '', 'backend', 'app.py'),
    path.join(process.resourcesPath || '', 'app', '_backend', 'app.py'),
    path.join(appRoot(), '_backend', 'app.py'),
    path.join(appRoot(), 'backend', 'app.py'),
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return null
}

function resolveFrontendDist() {
  const candidates = [
    path.join(process.resourcesPath || '', 'frontend'),
    path.join(process.resourcesPath || '', 'dist'),
    path.join(__dirname, '..', '..', 'dist'),
    path.join(__dirname, '..', 'dist'),
    path.join(process.resourcesPath || '', 'app', 'dist'),
    path.join(appRoot(), 'dist'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {}
  }
  return null
}

async function killOldBackend() {
  // Test if port 18685 is in use; if so, kill any process holding it.
  const net = require('net')
  const { execSync } = require('child_process')
  return new Promise(resolve => {
    const tester = net.createServer()
    let needKill = false
    tester.once('error', err => {
      if (err.code === 'EADDRINUSE') needKill = true
    })
    try { tester.listen(18685, '127.0.0.1') } catch { resolve(); return }
    setTimeout(() => {
      try { tester.close() } catch {}
      if (needKill) {
        console.log('Port 18685 already in use — killing old backend')
        try { execSync('pkill -9 -f "backend/app.py"', { stdio: 'ignore' }) } catch {}
        // Give the kernel ~500ms to release the socket
        setTimeout(resolve, 500)
      } else {
        resolve()
      }
    }, 100)
  })
}

async function startBackend() {
  const pythonPath = resolvePython()
  const backendScript = resolveBackendScript()
  if (!backendScript) {
    console.error('Backend script not found')
    return null
  }

  await killOldBackend()

  console.log('Starting backend:', pythonPath, backendScript)
  backendProcess = spawn(pythonPath, [backendScript], {
    cwd: path.dirname(backendScript),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MM_DEMO: '0',
      PORT: '18685',
      PYTHONUNBUFFERED: '1'
    }
  })
  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('error', err => console.error('Backend spawn error:', err.message))
  backendProcess.on('exit', code => console.log('Backend exited with code', code))
  return backendProcess
}

function waitForBackend(port = 18685, attempts = 40) {
  return new Promise((resolve, reject) => {
    let tries = 0
    const check = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1500 }, res => {
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.on('timeout', () => { req.destroy(); retry() })
    }
    const retry = () => {
      if (++tries >= attempts) return reject(new Error(`Backend not responding after ${attempts} attempts on port ${port}`))
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
    if (req.url.startsWith('/api/')) {
      const proxyReq = http.request({
        hostname: '127.0.0.1', port: backendPort, path: req.url,
        method: req.method, headers: req.headers
      }, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })
      proxyReq.on('error', () => {
        res.writeHead(502, {'Content-Type':'application/json'})
        res.end(JSON.stringify({error: 'backend down', hint: 'Python venv not bundled. Install Python 3.11 or use the Linux .deb'}))
      })
      req.pipe(proxyReq)
      return
    }
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
    await startBackend()
    startProxy(backendPort, frontendPort)
    try {
      await waitForBackend(backendPort)
      console.log('Backend ready, loading frontend')
      mainWindow.loadURL(`http://127.0.0.1:${frontendPort}`)
      mainWindow.show()
    } catch (e) {
      console.error('Backend startup failed:', e.message)
      mainWindow.show()
      const errMsg = e.message.replace(/'/g, "\\'")
      mainWindow.loadURL(`data:text/html;charset=utf-8,<html><body style='background:%230c0e12;color:%23ff6b6b;font-family:sans-serif;padding:40px;'><h2>Backend startup failed</h2><p>${errMsg}</p><p style='color:%23888'>Check Python venv at backend/.venv, or install Python 3.11 and run:<br><code>pip install -r requirements.txt</code></p></body></html>`)
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
Name=TM Mail Manager
Comment=Desktop email client
Exec=${exePath} %u
Icon=${iconRef}
Terminal=false
Categories=Office;Network;Email;
StartupNotify=true
StartupWMClass=TM Mail Manager
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

// Auto-update: download .deb to a temp dir, then install it via apt/dpkg.
// Kills current process before installing so dpkg can replace the running binary.
// Returns { ok, error, debPath } to the renderer.
ipcMain.handle('install-update', async (_e, { downloadUrl, version }) => {
  try {
    const os = require('os')
    const { spawn, exec, execSync } = require('child_process')
    const tmpDir = path.join(os.tmpdir(), 'mail-manager-update')
    fs.mkdirSync(tmpDir, { recursive: true })

    // Detect platform-specific asset name
    let assetName = downloadUrl.split('/').pop()
    if (!assetName || !assetName.endsWith('.deb')) {
      assetName = `mail-manager_${version}_amd64.deb`
    }
    const debPath = path.join(tmpDir, assetName)

    // Download via curl
    await new Promise((resolve, reject) => {
      const proc = spawn('curl', ['-fL', '-o', debPath, downloadUrl], { stdio: 'ignore' })
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)))
      proc.on('error', reject)
    })

    // Verify file
    const sz = fs.statSync(debPath).size
    if (sz < 1024 * 1024) {
      throw new Error(`Downloaded file too small (${sz} bytes), likely an error page`)
    }

    // Make file readable by root
    try { execSync(`chmod 644 "${debPath}"`, { stdio: 'ignore' }) } catch {}

    // Schedule the install to run AFTER we exit (so dpkg can replace this binary).
    // Strategy: write a shell script to /tmp that waits for our pid to die,
    // then runs pkexec dpkg -i. Then quit the app.
    const scriptPath = '/tmp/mail-manager-install.sh'
    const ourPid = process.pid
    const installCmd = `dpkg -i "${debPath}" || apt-get install -f -y`
    const script = `#!/bin/bash
# Wait for old mail-manager to exit completely (zombie processes too)
for i in $(seq 1 90); do
  if ! pgrep -af "mail-manager|backend/app.py" >/dev/null 2>&1; then break; fi
  # Force-kill any stragglers
  pkill -9 -f "/opt/mail-manager" 2>/dev/null || true
  pkill -9 -f "backend/app.py" 2>/dev/null || true
  sleep 0.5
done
# Make sure port 18685 is released
sleep 1
# Use pkexec to prompt for password graphically; fall back to sudo if pkexec not available
if command -v pkexec >/dev/null 2>&1; then
  pkexec bash -c '${installCmd.replace(/'/g, "'\\''")}'
else
  sudo bash -c '${installCmd.replace(/'/g, "'\\''")}'
fi
RC=$?
# Show result via notification
if [ $RC -eq 0 ]; then
  notify-send "TM Mail Manager" "Cập nhật v${version} thành công" 2>/dev/null || true
else
  notify-send "TM Mail Manager" "Cập nhật thất bại (code $RC)" 2>/dev/null || true
fi
exit $RC
`
    fs.writeFileSync(scriptPath, script, { mode: 0o755 })

    // Spawn the script detached so it runs after we quit
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
    })
    child.unref()

    // Force-kill mail-manager processes (including zygote/electron/chrome-sandbox)
    // so dpkg can replace /opt/mail-manager/* without "text file busy" errors.
    setTimeout(() => {
      console.log('Quitting for update...')
      try { execSync('pkill -9 -f "/opt/mail-manager" || true', { stdio: 'ignore' }) } catch {}
      try { execSync('pkill -9 -f "backend/app.py" || true', { stdio: 'ignore' }) } catch {}
      setTimeout(() => app.quit(), 200)
    }, 800)

    return { ok: true, debPath, size: sz, willRestart: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})
