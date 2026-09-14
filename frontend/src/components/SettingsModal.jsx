import React, { useState, useEffect } from 'react'
import { X, Plug, Trash2, LogOut, ShieldCheck, Loader2, UserPlus } from 'lucide-react'
import { api, setToken } from '../api'

export default function SettingsModal({ user, onClose, onLogout }) {
  const [accounts, setAccounts] = useState([])
  const [audit, setAudit] = useState([])
  const [tab, setTab] = useState('accounts')
  const [form, setForm] = useState({ email: '', password: '', exchange_url: 'https://mail.fpt.net/EWS/Exchange.asmx' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.accounts().then(d => setAccounts(d.accounts)).catch(() => {})
    api.audit().then(d => setAudit(d.events)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const connect = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await api.addAccount(form)
      setMsg({ ok: true, text: `Đã kết nối ${form.email}` })
      setForm({ ...form, password: '' })
      load()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} className="bg-dark-surface border border-dark-border rounded-xl w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-white">Cài đặt</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-gray-400"><X size={16} /></button>
        </div>
        <div className="flex gap-1 px-5 pt-3">
          {[['accounts', 'Tài khoản'], ['me', 'Cá nhân'], ['audit', 'Nhật ký']].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-xs rounded-md ${tab === id ? 'bg-primary/15 text-primary' : 'text-gray-500 hover:bg-dark-hover'}`}>{l}</button>
          ))}
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'accounts' && (
            <>
              <h3 className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Đã kết nối</h3>
              {accounts.length === 0 && <p className="text-sm text-gray-600 mb-4">Chưa có hộp thư Exchange nào.</p>}
              <div className="space-y-2 mb-5">
                {accounts.map(a => (
                  <div key={a.id} className="flex items-center gap-3 bg-dark-bg border border-dark-border rounded-lg px-3.5 py-2.5">
                    <div className="w-8 h-8 rounded bg-primary/15 text-primary flex items-center justify-center"><Plug size={14} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{a.address}</div>
                      <div className="text-[11px] text-gray-600 truncate">{a.provider} · {a.server_url}</div>
                    </div>
                    {a.sync_state && <span className="text-[10px] text-gray-600">sync {new Date(a.sync_state).toLocaleTimeString('vi-VN')}</span>}
                  </div>
                ))}
              </div>
              <h3 className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Thêm tài khoản Exchange</h3>
              <form onSubmit={connect} className="space-y-2">
                <input type="email" required placeholder="email@fpt.com" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary" />
                <input type="password" required placeholder="Mật khẩu (mã hóa Fernet khi lưu)" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary" />
                <input placeholder="EWS URL" value={form.exchange_url}
                  onChange={e => setForm({ ...form, exchange_url: e.target.value })}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-xs text-gray-400 focus:outline-none focus:border-primary" />
                {msg && <div className={`text-xs rounded px-3 py-2 border ${msg.ok ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>{msg.text}</div>}
                <button disabled={busy} className="btn-primary text-sm w-full py-2 flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Kết nối & kiểm tra
                </button>
              </form>
            </>
          )}

          {tab === 'me' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-lg">
                  {(user.display_name || user.email)[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-medium">{user.display_name || user.email}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">ID người dùng: {user.id} · dữ liệu tách biệt theo user</div>
                </div>
              </div>
              <button onClick={onLogout} className="btn-secondary text-sm w-full py-2 flex items-center justify-center gap-2 text-red-300">
                <LogOut size={14} /> Đăng xuất khỏi thiết bị này
              </button>
            </div>
          )}

          {tab === 'audit' && (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold mb-2 flex items-center gap-1.5"><ShieldCheck size={12} /> 50 hoạt động gần nhất của bạn</h3>
              <div className="space-y-1">
                {audit.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded hover:bg-dark-bg">
                    <span className="text-gray-600 w-32 shrink-0">{new Date(a.ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                    <span className="text-primary font-mono w-32 shrink-0">{a.action}</span>
                    <span className="text-gray-400 truncate">{a.resource} {a.detail && <span className="text-gray-600">({a.detail})</span>}</span>
                  </div>
                ))}
                {audit.length === 0 && <p className="text-sm text-gray-600">Chưa có hoạt động nào.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
