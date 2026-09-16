/* API client with auth token */
const BASE = '/api'
let token = localStorage.getItem('mm_token') || ''

export function setToken(t) {
  token = t
  if (t) localStorage.setItem('mm_token', t)
  else localStorage.removeItem('mm_token')
}
export const hasToken = () => !!token

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  if (res.status === 401) {
    setToken('')
    window.dispatchEvent(new Event('mm-unauthorized'))
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch {}
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  authStatus: () => req('GET', '/auth/status'),
  setup: (p) => req('POST', '/setup', p),
  verifyAccount: (p) => req('POST', '/accounts/verify', p),
  syncNow: () => req('POST', '/sync'),
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  logout: () => req('POST', '/auth/logout'),
  me: () => req('GET', '/auth/me'),
  folders: () => req('GET', '/folders'),
  createFolder: (name, parent_type) => req('POST', '/folders', { name, parent_type }),
  createSubfolder: (parentId, name) => req('POST', '/folders', { name, parent_id: parentId }),
  renameFolder: (id, name) => req('PUT', `/folders/${id}`, { name }),
  emptyFolder: (id) => req('POST', `/folders/${id}/empty`),
  markFolderRead: (id) => req('POST', `/folders/${id}/read`),
  thread: (tid) => req('GET', `/thread?tid=${encodeURIComponent(tid)}`),
  suggest: (q) => req('GET', `/suggest?q=${encodeURIComponent(q)}`),
  realtimeSet: (enabled) => req('POST', '/realtime', { enabled }),
  deleteFolder: (id) => req('DELETE', `/folders/${id}`),
  emails: (params) => req('GET', '/emails?' + params),
  email: (id) => req('GET', `/emails/${id}`),
  move: (id, folder_id) => req('POST', `/emails/${id}/move`, { folder_id }),
  archive: (id) => req('POST', `/emails/${id}/archive`),
  del: (id) => req('DELETE', `/emails/${id}`),
  restore: (id) => req('POST', `/emails/${id}/restore`),
  star: (id) => req('POST', `/emails/${id}/star`),
  flag: (id, due) => req('POST', `/emails/${id}/flag`, { due }),
  markRead: (id, is_read) => req('PUT', `/emails/${id}/read`, { is_read }),
  readAll: (folder) => req('POST', `/emails/-/read-all?folder=${folder}`),
  categories: () => req('GET', '/categories'),
  setCats: (id, cats) => req('PUT', `/emails/${id}/categories`, { categories: cats }),
  emailToTask: (id) => req('POST', `/emails/${id}/task`),
  reply: (id, body) => req('POST', `/emails/${id}/reply`, { body }),
  replyPreview: (id, mode) => req('GET', `/emails/${id}/reply-preview?mode=${mode}`),
  forwardPayload: (id) => req('GET', `/emails/${id}/forward-payload`),
  attachmentUrl: (eid, aid) => `/api/emails/${eid}/attachments/${aid}/download?token=${encodeURIComponent(localStorage.getItem('mm_' + 'token') || '')}`,
  attachmentThumbUrl: (eid, aid) => `/api/emails/${eid}/attachments/${aid}/thumb?token=${encodeURIComponent(localStorage.getItem('mm_' + 'token') || '')}`,
  cidUrl: (eid, cid) => `/api/emails/${eid}/cid/${encodeURIComponent(cid || '')}?token=${encodeURIComponent(localStorage.getItem('mm_' + 'token') || '')}`,
  rules: () => req('GET', '/rules'),
  createRule: (r) => req('POST', '/rules', r),
  deleteRule: (id) => req('DELETE', `/rules/${id}`),
  runRules: () => req('POST', '/rules/-/run'),
  searchFolders: () => req('GET', '/search-folders'),
  createSearchFolder: (q) => req('POST', '/search-folders', q),
  deleteSearchFolder: (id) => req('DELETE', `/search-folders/${id}`),
  setReadServer: (id, isRead) => req('PUT', `/emails/${id}/read`, { is_read: isRead }),
  compose: (to, subject, body, send, extra = {}) => req('POST', '/compose', { to, subject, body, send, ...extra }),
  stats: () => req('GET', '/stats'),
  search: (q) => req('GET', '/search?q=' + encodeURIComponent(q)),
  tasks: () => req('GET', '/tasks'),
  addTask: (t) => req('POST', '/tasks', t),
  patchTask: (id, t) => req('PATCH', `/tasks/${id}`, t),
  delTask: (id) => req('DELETE', `/tasks/${id}`),
  contacts: () => req('GET', '/contacts'),
  addContact: (c) => req('POST', '/contacts', c),
  delContact: (id) => req('DELETE', `/contacts/${id}`),
  events: () => req('GET', '/events'),
  addEvent: (e) => req('POST', '/events', e),
  delEvent: (id) => req('DELETE', `/events/${id}`),
  accounts: () => req('GET', '/accounts'),
  addAccount: (a) => req('POST', '/accounts', a),
  audit: () => req('GET', '/audit'),
  settings: () => req('GET', '/settings'),
  saveSettings: (values) => req('PUT', '/settings', { values })
}

// push theme/density prefs to the server (best-effort, silent on failure)
import { setSettingsPusher } from './theme'
setSettingsPusher((values) => {
  req('PUT', '/settings', { values }).catch(() => {})
})
