import React, { useState, useEffect, useCallback } from 'react'
import { api, hasToken, setToken } from './api'
import Login from './components/Login'
import SetupWizard from './components/SetupWizard'
import AppRail from './components/AppRail'
import TopBar from './components/TopBar'
import StatusBar from './components/StatusBar'
import MailView from './components/MailView'
import CalendarView from './components/CalendarView'
import PeopleView from './components/PeopleView'
import TasksView from './components/TasksView'
import RulesView from './components/RulesView'
import RuleModal from './components/RuleModal'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [module, setModule] = useState('mail')

  // global search (TopBar) can originate from any module; jump to Mail when
  // a result is chosen, and honor explicit module switches from inside views
  useEffect(() => {
    const onModule = (e) => setModule(String(e.detail || 'mail'))
    window.addEventListener('mm-module', onModule)
    return () => window.removeEventListener('mm-module', onModule)
  }, [])
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSection, setSettingsSection] = useState('general')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [online, setOnline] = useState(true)
  const [rt, setRt] = useState(null)   // last realtime event {type, subject, ts}
  const [rulesFolders, setRulesFolders] = useState([])
  const [ruleModal, setRuleModal] = useState(null)   // {mode:'new'|'edit', rule?}

  // folder tree is needed by both MailView and the rules editor
  const refreshFolders = useCallback(() => {
    api.folders().then(d => setRulesFolders(d.tree || [])).catch(() => {})
  }, [])
  useEffect(() => { if (user) refreshFolders() }, [user, refreshFolders])

  useEffect(() => {
    if (!user) { return }
    let es = null
    let pollTimer = null
    let lastTs = Date.now() / 1000
    let sseDead = false
    const startPoll = () => {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        try {
          const r = await fetch(`/api/realtime/poll?since=${lastTs}`)
          const d = await r.json()
          if (d.events?.length) {
            lastTs = d.server_ts || lastTs
            setRt(d.events[d.events.length - 1])
          }
        } catch { /* offline */ }
      }, 8000)
    }
    try {
      es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(localStorage.getItem('mm_' + 'token') || '')}`)
      es.onmessage = (e) => {
        sseDead = false
        try {
          const ev = JSON.parse(e.data)
          ev.ts && (lastTs = ev.ts)
          setRt(ev)
          // Outlook-style desktop toast on new mail (Electron native notification)
          if (ev.type === 'new_mail' && ev.subject) {
            const title = ev.from ? `📩 ${ev.from}` : '📩 Thư mới'
            const body = ev.subject + (ev.folder ? ` — ${ev.folder}` : '')
            if (window.electron?.notify) window.electron.notify(title, body)
            else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(title, { body })
            }
          }
        } catch { /* comment frames */ }
      }
      es.onerror = () => {          // tunnel/proxy may not carry SSE — fall back to polling
        sseDead = true
        startPoll()
      }
      setTimeout(() => { if (sseDead) startPoll() }, 1000)   // quick fallback through broken proxies
    } catch { startPoll() }
    return () => {
      es && es.close()
      pollTimer && clearInterval(pollTimer)
    }
  }, [user])

  // auto-refresh mail views when realtime reports new/changed items
  useEffect(() => {
    if (!rt) return
    window.dispatchEvent(new Event('mm-synced'))
  }, [rt])

  useEffect(() => {
    const boot = async () => {
      try {
        const st = await api.authStatus()
        setSetupNeeded(st.setup_required)
      } catch { /* server unreachable; fall through to login */ }
      if (!hasToken()) { setBooting(false); return }
      try {
        const d = await api.me()
        setUser(d.user)
        const a = await api.accounts()
        setHasAccount((a.accounts || []).length > 0)
      } catch {
        setToken('')
      } finally {
        setBooting(false)
      }
    }
    boot()
    const onUnauth = () => { setUser(null); setModule('mail') }
    window.addEventListener('mm-unauthorized', onUnauth)
    const onNet = () => setOnline(navigator.onLine)
    window.addEventListener('online', onNet)
    window.addEventListener('offline', onNet)
    return () => {
      window.removeEventListener('mm-unauthorized', onUnauth)
      window.removeEventListener('online', onNet)
      window.removeEventListener('offline', onNet)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return
      if (e.key === '?') { e.preventDefault(); setSettingsSection('shortcuts'); setShowSettings(true) }
      else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); window.dispatchEvent(new Event('mm-new-mail'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  if (booting) {
    return <div className="h-screen flex items-center justify-center bg-dark-bg text-ink-mute text-sm">Đang tải…</div>
  }
  if (!user) {
    return setupNeeded
      ? <SetupWizard onDone={(u) => { setUser(u); setHasAccount(true) }} />
      : <Login onDone={(u) => setUser(u)} />
  }

  const logout = async () => {
    try { await api.logout() } catch {}
    setToken(''); setUser(null); setShowSettings(false)
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-dark-bg">
      <div className="flex-1 flex overflow-hidden">
        <AppRail module={module} onModule={setModule} user={user} onSettings={() => setShowSettings(true)} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar />
          {module === 'mail' && <MailView user={user} />}
          {module === 'calendar' && <CalendarView />}
          {module === 'people' && <PeopleView />}
          {module === 'tasks' && <TasksView />}
          {module === 'rules' && (
            <RulesView folders={rulesFolders} onNew={() => setRuleModal({ mode: 'new' })}
              onEdit={(r) => setRuleModal({ mode: 'edit', rule: r })} />
          )}
          <StatusBar online={online} itemInfo="" hasAccount={hasAccount} realtime={rt} onRefresh={() => window.dispatchEvent(new Event('mm-synced'))} />
        </div>
      </div>
      {showSettings && <SettingsModal user={user} section={settingsSection} onClose={() => setShowSettings(false)} onLogout={logout} folders={rulesFolders} />}
      {ruleModal && (
        <RuleModal
          folders={rulesFolders}
          initial={ruleModal.mode === 'edit' ? ruleModal.rule : ruleModal.rule}
          rule={ruleModal.mode === 'edit' ? ruleModal.rule : null}
          onClose={() => setRuleModal(null)}
          onCreated={() => { setRuleModal(null); window.dispatchEvent(new Event('mm-synced')) }}
        />
      )}
    </div>
  )
}
