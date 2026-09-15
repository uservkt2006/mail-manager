import React, { useState, useEffect, useCallback } from 'react'
import { X, Plug, LogOut, ShieldCheck, Loader2, UserPlus, Trash2, SlidersHorizontal,
  RefreshCw, PenLine, Keyboard, Info, Sun, Moon, MonitorSmartphone, LayoutList, Mail } from 'lucide-react'
import { api, setToken } from '../api'
import { getTheme, setTheme, getDensity, setDensity, getReadingPane, setReadingPane,
  getComposeFont, setComposeFont, getComposeSize, setComposeSize } from '../theme'
import RichEditor from './RichEditor'

const SECTIONS = [
  { id: 'general', label: 'Chung', icon: SlidersHorizontal },
  { id: 'accounts', label: 'Tài khoản', icon: Plug },
  { id: 'sync', label: 'Đồng bộ', icon: RefreshCw },
  { id: 'signature', label: 'Chữ ký', icon: PenLine },
  { id: 'shortcuts', label: 'Phím tắt', icon: Keyboard },
  { id: 'audit', label: 'Nhật ký hoạt động', icon: ShieldCheck },
  { id: 'about', label: 'Giới thiệu', icon: Info },
]

const SHORTCUTS = [
  ['Ctrl+N', 'Soạn thư mới'], ['/', 'Tìm kiếm'], ['R', 'Trả lời'], ['A', 'Trả lời tất cả / Lưu trữ*'],
  ['F', 'Chuyển tiếp'], ['E', 'Lưu trữ'], ['Del / D', 'Xóa (vào Thùng rác)'],
  ['U', 'Đánh dấu chưa đọc'], ['Enter', 'Mở thư'], ['J / K hoặc ↑ ↓', 'Di chuyển trong danh sách'],
  ['Chuột phải', 'Menu nhanh trên thư'], ['Esc', 'Đóng menu/modal'], ['?', 'Bảng trợ giúp phím'],
]
const isElectron = typeof window !== 'undefined' && !!window.electron

export default function SettingsModal({ user, section = 'general', onClose, onLogout }) {
  const [sec, setSec] = useState(section)
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [audit, setAudit] = useState([])
  const [acctForm, setAcctForm] = useState({ email: '', password: '', exchange_url: 'https://mail.fpt.net/EWS/Exchange.asmx' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [themePref, setThemePref] = useState(getTheme())
  const [density, setDensityState] = useState(getDensity())
  const [pane, setPaneState] = useState(getReadingPane())

  const load = useCallback(() => {
    api.settings().then(d => setSettings(d.settings)).catch(() => {})
    api.accounts().then(d => setAccounts(d.accounts)).catch(() => {})
    api.audit().then(d => setAudit(d.events)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const saveS = (values) => {
    setSettings(s => ({ ...s, ...values }))
    api.saveSettings(values).catch(() => {})
  }

  const connect = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await api.addAccount({ email: acctForm.email, password: acctForm.password, exchange_url: acctForm.exchange_url })
      setMsg({ ok: true, text: `Đã kết nối ${acctForm.email} — bấm "Đồng bộ ngay" để kéo dữ liệu` })
      setAcctForm({ ...acctForm, password: '' }); load()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  const doSync = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await api.syncNow()
      const t = r.total || {}
      setMsg({ ok: true, text: `Đồng bộ xong: +${t.messages || 0} mail · +${t.events || 0} lịch · +${t.contacts || 0} liên hệ` })
      load()
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()}
        className="bg-dark-surface border border-dark-border rounded-xl w-[780px] max-w-[94vw] h-[580px] max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-border shrink-0">
          <h2 className="text-sm font-semibold text-ink-strong">Cài đặt</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={16} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* left nav */}
          <div className="w-52 shrink-0 border-r border-dark-border p-2 space-y-0.5 overflow-y-auto">
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => { setSec(s.id); setMsg(null) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  sec === s.id ? 'bg-pa15 text-primary font-medium' : 'text-ink-dim hover:bg-dark-hover'}`}>
                <s.icon size={14} /> {s.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="flex-1 overflow-y-auto p-6">
            {sec === 'general' && (
              <div className="space-y-7">
                <h3 className="text-base font-semibold text-ink-strong">Giao diện</h3>
                <Row label="Chủ đề (theme)">
                  <Segment options={[['dark', 'Tối', Moon], ['light', 'Sáng', Sun], ['system', 'Hệ thống', MonitorSmartphone]]}
                    value={themePref} onChange={(v) => { setThemePref(v); setTheme(v) }} />
                </Row>
                <Row label="Mật độ danh sách" hint="Compact hiển thị được nhiều thư hơn">
                  <Segment options={[['comfortable', 'Thoáng'], ['compact', 'Chặt chẽ']]}
                    value={density} onChange={(v) => { setDensityState(v); setDensity(v) }} />
                </Row>
                <Row label="Khung đọc (reading pane)">
                  <Segment options={[['right', 'Bên phải'], ['bottom', 'Bên dưới'], ['off', 'Tắt']]}
                    value={pane} onChange={(v) => { setPaneState(v); setReadingPane(v); saveS({ reading_pane: v }) }} />
                </Row>
              </div>
            )}

            {sec === 'accounts' && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-ink-strong">Hộp thư đã kết nối</h3>
                {accounts.length === 0 && <p className="text-sm text-ink-mute">Chưa có tài khoản Exchange nào.</p>}
                <div className="space-y-2">
                  {accounts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 bg-dark-bg border border-dark-border rounded-lg px-4 py-3">
                      <div className="w-8 h-8 rounded bg-pa15 text-primary flex items-center justify-center"><Plug size={14} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-strong truncate">{a.address}</div>
                        <div className="text-[11px] text-ink-mute truncate">{a.provider} · {a.server_url}</div>
                      </div>
                      {a.sync_state && <span className="text-[10px] text-ink-mute shrink-0">sync {new Date(a.sync_state).toLocaleTimeString('vi-VN')}</span>}
                    </div>
                  ))}
                </div>
                <h4 className="text-xs uppercase tracking-wider text-ink-mute font-semibold pt-2">Thêm tài khoản</h4>
                <form onSubmit={connect} className="space-y-2">
                  <input type="email" required placeholder="email@fpt.net" value={acctForm.email}
                    onChange={e => setAcctForm({ ...acctForm, email: e.target.value })} className={inp} />
                  <input type="password" required placeholder="Mật khẩu (mã hóa Fernet khi lưu)" value={acctForm.password}
                    onChange={e => setAcctForm({ ...acctForm, password: e.target.value })} className={inp} />
                  <input placeholder="EWS URL" value={acctForm.exchange_url}
                    onChange={e => setAcctForm({ ...acctForm, exchange_url: e.target.value })} className={inp + ' text-xs'} />
                  {renderMsg(msg)}
                  <button disabled={busy} className="btn-primary text-sm w-full py-2 flex items-center justify-center gap-2 disabled:opacity-50">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Kết nối &amp; kiểm tra
                  </button>
                </form>
              </div>
            )}

            {sec === 'sync' && settings && (
              <div className="space-y-5">
                <h3 className="text-base font-semibold text-ink-strong">Đồng bộ Exchange</h3>
                <Toggle label="Tự động đồng bộ" hint={`Kiểm tra hộp thư mới mỗi ${settings.sync_interval_min || 5} phút khi app mở`}
                  checked={!!settings.autosync} onChange={v => saveS({ autosync: v })} />
                <Row label="Khoảng đồng bộ (phút)">
                  <Segment options={[['2', '2'], ['5', '5'], ['10', '10'], ['30', '30']].map(([v, l]) => [Number(v), l])}
                    value={settings.sync_interval_min || 5} onChange={v => saveS({ sync_interval_min: v })} />
                </Row>
                {renderMsg(msg)}
                <button onClick={doSync} disabled={busy || accounts.length === 0}
                  className="btn-secondary text-sm w-full py-2 flex items-center justify-center gap-2 disabled:opacity-40">
                  <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Đồng bộ ngay
                </button>
                <p className="text-[11px] text-ink-mute leading-relaxed">
                  Đồng bộ kéo: mail các hộp thư đã dùng (mới nhất trước), lịch 14 ngày tới, danh bạ.
                  Hành động đọc/đánh dấu/nhãn chỉ áp dụng trên máy bạn — chưa đẩy ngược lên server (v3.3).
                </p>
              </div>
            )}

            {sec === 'signature' && settings && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-ink-strong">Chữ ký email</h3>
                <p className="text-xs text-ink-mute">Tự chèn vào cuối thư khi <b className="text-ink-dim">Gửi</b> (không chèn vào bản nháp). Soạn kiểu HTML: đậm/nghiêng/màu/phông — ảnh dán vào cũng được giữ.</p>
                <RichEditor html={settings.signature_html || ''}
                  onChange={h => setSettings({ ...settings, signature_html: h })}
                  minHeight={130} placeholder={'Trân trọng,\nVõ Khắc Tâm\nFPT Telecom'} />
                <button onClick={() => {
                  const tmp = document.createElement('div'); tmp.innerHTML = settings.signature_html || ''
                  saveS({ signature_html: settings.signature_html || '', signature: tmp.textContent.replace(/\s+/g, ' ').trim() })
                  setMsg({ ok: true, text: 'Đã lưu chữ ký' })
                }} className="btn-primary text-sm">Lưu chữ ký</button>
                <div className="border-t border-dark-border pt-4">
                  <h4 className="text-sm font-semibold text-ink-strong mb-1">Font mặc định khi soạn/trả lời</h4>
                  <p className="text-xs text-ink-mute mb-3">Áp dụng cho phần nội dung thư mới, trả lời và chuyển tiếp.</p>
                  <div className="flex gap-6">
                    <label className="text-xs text-ink-dim">Phông
                      <select value={getComposeFont()} onChange={e => setComposeFont(e.target.value)} className={inp + ' mt-1 block'}>
                        {['Calibri', 'Arial', 'Times New Roman', 'Tahoma', 'Verdana', 'JetBrains Mono'].map(f => <option key={f}>{f}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-ink-dim">Cỡ chữ
                      <select value={getComposeSize()} onChange={e => setComposeSize(e.target.value)} className={inp + ' mt-1 block'}>
                        {['12px', '13px', '14px', '16px', '18px'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {sec === 'shortcuts' && (
              <div>
                <h3 className="text-base font-semibold text-ink-strong mb-4">Phím tắt</h3>
                <div className="rounded-lg border border-dark-border overflow-hidden">
                  {SHORTCUTS.map(([k, v], i) => (
                    <div key={k} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i % 2 ? 'bg-dark-bg' : ''}`}>
                      <kbd className="font-mono text-xs bg-dark-hover border border-dark-border rounded px-2 py-0.5 text-ink">{k}</kbd>
                      <span className="text-ink-dim">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-ink-mute mt-3">* A = Trả lời tất cả khi đang xem thư; Lưu trữ dùng phím E.</p>
              </div>
            )}

            {sec === 'audit' && (
              <div>
                <h3 className="text-base font-semibold text-ink-strong mb-4 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-primary" /> 50 hoạt động gần nhất của bạn
                </h3>
                <div className="space-y-0.5">
                  {audit.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs px-2 py-2 rounded hover:bg-dark-bg">
                      <span className="text-ink-mute w-32 shrink-0">{new Date(a.ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                      <span className="text-primary font-mono w-32 shrink-0">{a.action}</span>
                      <span className="text-ink-dim truncate">{a.resource} {a.detail && <span className="text-ink-mute">({a.detail})</span>}</span>
                    </div>
                  ))}
                  {audit.length === 0 && <p className="text-sm text-ink-mute">Chưa có hoạt động nào.</p>}
                </div>
              </div>
            )}

            {sec === 'about' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center"><Mail size={20} className="text-white" /></div>
                  <div>
                    <div className="text-ink-strong font-semibold">Mail Manager</div>
                    <div className="text-xs text-ink-mute">v3.2 · TM TOOL — Võ Khắc Tâm</div>
                  </div>
                </div>
                <p className="text-sm text-ink-dim leading-relaxed">
                  Email client cho Exchange/FPT: đọc-gửi, lịch, danh bạ, công việc.
                  {isElectron ? ' Đang chạy ở chế độ desktop (Electron).' : ' Đang chạy trong trình duyệt.'}
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-9 h-9 rounded-full bg-pa20 text-primary flex items-center justify-center text-sm font-semibold">
                    {(user.display_name || user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-strong">{user.display_name || user.email}</div>
                    <div className="text-xs text-ink-mute">{user.email}</div>
                  </div>
                  <button onClick={onLogout} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 text-red-400">
                    <LogOut size={12} /> Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const inp = "w-full bg-dark-bg border border-dark-border rounded-md px-3.5 py-2.5 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-primary"

function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-[11px] text-ink-mute mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Segment({ options, value, onChange }) {
  return (
    <div className="flex bg-dark-bg border border-dark-border rounded-lg p-0.5">
      {options.map(([v, label, Icon]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
            String(value) === String(v) ? 'bg-pa15 text-primary font-medium' : 'text-ink-dim hover:text-ink'}`}>
          {Icon && <Icon size={12} />} {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-[11px] text-ink-mute mt-0.5">{hint}</div>}
      </div>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`w-10 h-[22px] rounded-full p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-dark-hover border border-dark-border'}`}>
        <span className={`block w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  )
}

function renderMsg(msg) {
  if (!msg) return null
  return <div className={`text-xs rounded px-3 py-2 border ${msg.ok ? 'text-green-400 bg-green-500/10 border-green-500/25' : 'text-red-300 bg-red-500/10 border-red-500/25'}`}>{msg.text}</div>
}
