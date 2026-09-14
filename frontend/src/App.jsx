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
import SettingsModal from './components/SettingsModal'

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [module, setModule] = useState('mail')
  const [showSettings, setShowSettings] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [online, setOnline] = useState(true)

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

  if (booting) {
    return <div className="h-screen flex items-center justify-center bg-dark-bg text-gray-600 text-sm">Đang tải…</div>
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
          <StatusBar online={online} itemInfo="" hasAccount={hasAccount} />
        </div>
      </div>
      {showSettings && <SettingsModal user={user} onClose={() => setShowSettings(false)} onLogout={logout} />}
    </div>
  )
}
