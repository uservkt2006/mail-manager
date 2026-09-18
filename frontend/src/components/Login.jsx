import React, { useState } from 'react'
import { api, setToken } from '../api'
import { Mail, Lock, Loader2 } from 'lucide-react'

export default function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const d = await api.login(email.trim(), password)
      setToken(d.token)
      onDone(d.user)
    } catch (ex) {
      setErr(ex.message === 'Unauthorized' ? 'Phiên hết hạn' : ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-dark-bg">
      <form onSubmit={submit} className="w-[360px] bg-dark-surface border border-dark-border rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
            <Mail size={20} className="text-ink-strong" />
          </div>
          <div>
            <h1 className="font-semibold text-ink-strong">TM Mail Manager</h1>
            <p className="text-xs text-ink-dim">Đăng nhập để tiếp tục</p>
          </div>
        </div>
        <label className="block text-xs font-medium text-ink-dim mb-1.5">Email công việc</label>
        <input
          type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
          placeholder="ten.ban@fpt.com"
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3.5 py-2.5 text-sm text-ink-strong placeholder-gray-600 focus:outline-none focus:border-primary mb-4"
        />
        <label className="block text-xs font-medium text-ink-dim mb-1.5">Mật khẩu</label>
        <div className="relative mb-5">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-dark-bg border border-dark-border rounded-md pl-9 pr-3 py-2.5 text-sm text-ink-strong focus:outline-none focus:border-primary"
          />
        </div>
        {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{err}</div>}
        <button type="submit" disabled={busy}
          className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Đăng nhập
        </button>
      </form>
    </div>
  )
}
