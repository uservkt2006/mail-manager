/* Client theme + density prefs: localStorage first, server copy synced best-effort. */
const THEME_KEY = '***'
const DENSITY_KEY = '***'
const PANE_KEY = '***'

function safeLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}

export function getTheme() {
  return safeLocal(THEME_KEY, 'dark')          // 'dark' | 'light' | 'system'
}
export function getDensity() {
  return safeLocal(DENSITY_KEY, 'comfortable') // 'comfortable' | 'compact'
}
export function getReadingPane() {
  return safeLocal(PANE_KEY, 'right')          // 'right' | 'bottom' | 'off'
}

function prefersDarkMedia() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')
}

export function applyTheme() {
  const pref = getTheme()
  const sysDark = prefersDarkMedia()?.matches ?? true
  const dark = pref === 'dark' || (pref === 'system' && sysDark)
  document.documentElement.classList.toggle('light', !dark)
  document.documentElement.dataset.density = getDensity()
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref) } catch {}
  applyTheme()
  pushToServer({ theme: pref })
}
export function setDensity(d) {
  try { localStorage.setItem(DENSITY_KEY, d) } catch {}
  applyTheme()
  pushToServer({ density: d })
}
export function setReadingPane(p) {
  try { localStorage.setItem(PANE_KEY, p) } catch {}
  pushToServer({ reading_pane: p })
}

let pusher = null
export function setSettingsPusher(fn) { pusher = fn }
function pushToServer(values) {
  try { pusher?.(values) } catch { /* offline / not logged in yet */ }
}

/* system mode live-follow */
prefersDarkMedia()?.addEventListener?.('change', () => {
  if (getTheme() === 'system') applyTheme()
})
