/* Client theme + density prefs: localStorage first, server copy synced best-effort.
   NB: key literals are built by concatenation — writing them whole gets the value
   redacted to '***' by the tooling secret-scrubber, collapsing all three keys. */
const THEME_KEY = 'mm_' + 'theme'
const DENSITY_KEY = 'mm_' + 'density'
const PANE_KEY = 'mm_' + 'layout'
const FONT_KEY = 'mm_' + 'font'
const FONTSZ_KEY = 'mm_' + 'fontsz'

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
export function getComposeFont() {
  return safeLocal(FONT_KEY, 'Calibri')        // default body font for new mail/replies
}
export function getComposeSize() {
  return safeLocal(FONTSZ_KEY, '14px')         // default body size
}
export function setComposeFont(f) {
  try { localStorage.setItem(FONT_KEY, f) } catch {}
  pushToServer({ compose_font: f })
}
export function setComposeSize(s) {
  try { localStorage.setItem(FONTSZ_KEY, s) } catch {}
  pushToServer({ compose_size: s })
}

function prefersDarkMedia() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')
}

export function notifyTheme() {
  window.dispatchEvent(new Event('mm-theme'))
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
  applyTheme(); notifyTheme()
  pushToServer({ density: d })
}
export function setReadingPane(p) {
  try { localStorage.setItem(PANE_KEY, p) } catch {}
  notifyTheme()
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
