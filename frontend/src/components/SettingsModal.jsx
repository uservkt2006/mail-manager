import React, { useState, useEffect, useCallback } from 'react'
import { X, Plug, LogOut, ShieldCheck, Loader2, UserPlus, Trash2, SlidersHorizontal,
  RefreshCw, PenLine, Keyboard, Info, Sun, Moon, MonitorSmartphone, LayoutList, Mail, Archive, FolderOpen, Download, FileText, Reply, HardDrive, AlertCircle, Loader2 as L2 } from 'lucide-react'
import { api, setToken } from '../api'
import { getTheme, setTheme, getDensity, setDensity, getReadingPane, setReadingPane,
  getComposeFont, setComposeFont, getComposeSize, setComposeSize } from '../theme'
import RichEditor from './RichEditor'

const SECTIONS = [
  { id: 'general', label: 'Chung', icon: SlidersHorizontal },
  { id: 'accounts', label: 'Tài khoản', icon: Plug },
  { id: 'sync', label: 'Đồng bộ', icon: RefreshCw },
  { id: 'archive', label: 'Lưu trữ cục bộ', icon: Archive },
  { id: 'autoreply', label: 'Trả lời tự động', icon: Reply },
  { id: 'storage', label: 'Dung lượng', icon: HardDrive },
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

function AutoReplySection({ onMsg }) {
  const [oof, setOof] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    api.autoreplyGet().then(setOof).catch(e => setOof({ error: e.message }))
  }, [])
  useEffect(() => { load() }, [load])
  if (!oof) return <div className="flex items-center gap-2 text-ink-mute text-sm"><L2 size={14} className="animate-spin" /> Đang đọc trạng thái từ Exchange…</div>
  if (oof.error) return <div className="text-sm text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {oof.error}</div>
  const dirty = JSON.stringify({
    enabled: !!oof.enabled, external: !!oof.external, message: oof.message || '',
  }) !== JSON.stringify({ enabled: false, external: true, message: '' })
  const save = async () => {
    setBusy(true)
    try {
      await api.autoreplySet({ enabled: !!oof.enabled, external: !!oof.external, message: oof.message || '' })
      onMsg?.({ ok: true, text: oof.enabled ? 'Đã bật trả lời tự động' : 'Đã tắt trả lời tự động' })
      load()
    } catch (e) { onMsg?.({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ink-strong">Trả lời tự động</h3>
      <p className="text-xs text-ink-mute leading-relaxed">
        Bật để Exchange tự gửi câu trả lời cho người gửi mail cho bạn (giống "Automatic Replies" trong Outlook).
        Hoạt động ngay cả khi app tắt — cấu hình nằm trên server.
      </p>
      <div className={`rounded-lg border p-4 ${oof.enabled ? 'border-pa40 bg-pa10' : 'border-dark-border bg-dark-bg'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={!!oof.enabled}
            onChange={e => setOof({ ...oof, enabled: e.target.checked })} />
          <div>
            <div className="text-sm font-medium text-ink-strong">Bật trả lời tự động</div>
            <div className="text-[11px] text-ink-mute">Mọi người gửi thư cho bạn sẽ nhận được phản hồi.</div>
          </div>
        </label>
        {oof.enabled && (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
              <input type="checkbox" checked={!!oof.external}
                onChange={e => setOof({ ...oof, external: e.target.checked })} />
              Gửi cho người ngoài tổ chức
            </label>
            <div>
              <div className="text-xs text-ink-dim mb-1">Nội dung trả lời</div>
              <textarea value={oof.message || ''} onChange={e => setOof({ ...oof, message: e.target.value })}
                rows={6} className={inp + ' font-mono text-xs'}
                placeholder={'Cảm ơn bạn đã liên hệ.\nHiện tôi không có mặt, sẽ trả lời sớm khi có thể.\n\nTrân trọng,\nVõ Khắc Tâm'} />
            </div>
            {oof.scheduled && (
              <p className="text-[11px] text-ink-mute">Đang trong khoảng giờ đã lên lịch trên Exchange: {oof.start_at} → {oof.end_at}</p>
            )}
          </div>
        )}
      </div>
      {dirty && (
        <button onClick={save} disabled={busy} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
          {busy ? <L2 size={14} className="animate-spin" /> : <Reply size={14} />} Lưu thay đổi
        </button>
      )}
    </div>
  )
}

function StorageSection() {
  const [usage, setUsage] = useState(null)
  const [err, setErr] = useState(null)
  const load = useCallback(() => {
    setErr(null); setUsage(null)
    api.mailboxUsage().then(setUsage).catch(e => setErr(e.message))
  }, [])
  useEffect(() => { load() }, [load])
  if (err) return <div className="text-sm text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {err}</div>
  if (!usage) return <div className="flex items-center gap-2 text-ink-mute text-sm"><L2 size={14} className="animate-spin" /> Đang lấy dung lượng từ Exchange…</div>
  const pct = Math.min(100, Math.round(usage.total_bytes / (50 * 1024**3) * 100))
  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-ink-strong">Dung lượng hộp thư</h3>
      <div className="bg-dark-bg border border-dark-border rounded-lg p-5">
        <div className="flex items-end justify-between mb-2">
          <span className="text-2xl font-semibold text-ink-strong">{usage.total_human}</span>
          <span className="text-xs text-ink-mute">đã dùng</span>
        </div>
        <div className="h-2 rounded-full bg-dark-hover overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-ink-mute">
          <span>{pct}% của 50 GB</span>
          <button onClick={load} className="hover:text-primary">Tải lại</button>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-ink-strong mb-2">Top thư mục theo dung lượng</h4>
        <div className="rounded-lg border border-dark-border overflow-hidden">
          {usage.folders.map((f, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ backgroundColor: i % 2 ? 'var(--bg)' : 'transparent' }}>
              <span className="text-ink-dim truncate flex-1">{f.name}</span>
              <span className="text-ink-mute ml-4">{f.human}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-ink-mute">
        Dữ liệu lấy trực tiếp từ Exchange (cập nhật 10 phút/lần). Dọn dung lượng bằng "Lưu trữ cục bộ" — mỗi thư xuất ra .eml và bị xoá khỏi server.
      </p>
    </div>
  )
}

function ArchiveBrowser({ onOpenMail }) {
  const [cur, setCur] = useState('')
  const [items, setItems] = useState([])
  const [err, setErr] = useState(null)
  const refresh = (p) => {
    setErr(null)
    api.archiveBrowse(p).then(d => { setCur(d.current || ''); setItems(d.items || []) })
      .catch(e => setErr(e.message))
  }
  useEffect(() => { refresh('') }, [])
  if (err) return <div className="text-xs text-red-400">{err}</div>
  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg p-2 max-h-48 overflow-y-auto">
      <div className="flex items-center gap-1 mb-1">
        <button onClick={() => refresh('')} className="text-[11px] text-ink-mute hover:text-primary px-1 py-0.5">Root</button>
        {cur && <><span className="text-ink-mute text-[11px]">/</span><span className="text-[11px] text-ink">{cur}</span></>}
      </div>
      {items.length === 0 && !err && <div className="text-xs text-ink-mute p-2">Chưa có thư nào được lưu trữ — bấm “Lưu trữ về máy” ở menu chuột phải của một thư.</div>}
      {items.map(it => it.type === 'dir' ? (
        <div key={it.name} className="flex items-center gap-2 px-2 py-1 text-sm text-ink cursor-pointer hover:bg-dark-hover"
          onClick={() => refresh(it.name)}>
          <Archive size={13} className="text-ink-mute" /> {it.name}
        </div>
      ) : (
        <div key={it.name} className="flex items-center gap-2 px-2 py-1 text-sm text-ink-dim cursor-pointer hover:bg-dark-hover"
          onClick={() => api.archiveEml((cur ? cur + '/' : '') + it.name).then(d => onOpenMail(d.mail))}>
          <FileText size={13} className="text-ink-mute" /> {it.name} <span className="text-[11px] text-ink-mute ml-auto">{(it.size/1024).toFixed(1)} KB</span>
        </div>
      ))}
      {err && <div className="text-xs text-red-400 p-2">{err}</div>}
    </div>
  )
}

export default function SettingsModal({ user, section = 'general', onClose, onLogout, folders = [] }) {
  const [sec, setSec] = useState(section)
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [audit, setAudit] = useState([])
  const [acctForm, setAcctForm] = useState({ email: '', password: '', exchange_url: 'https://mail.fpt.net/EWS/Exchange.asmx' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showingArchiveDialog, setShowingArchiveDialog] = useState(false)
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

  if (showingArchiveDialog) {
    return <ArchiveDialog folders={folders} onClose={() => setShowingArchiveDialog(false)} onMsg={setMsg} />
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
                <Toggle label="Tự động đồng bộ" hint={`Mail mới tự xuất hiện sau vài giây (delta sync Exchange); khi bật, kiểm tra thêm lịch & danh bạ mỗi ${settings.sync_interval_min || 5} phút`}
                  checked={!!settings.autosync} onChange={v => { saveS({ autosync: v }); api.realtimeSet(v).catch(() => {}) }} />
                {settings.autosync && (
                  <Row label="Khoảng đồng bộ sâu (phút)" hint="Lịch & danh bạ — mail đã realtime riêng">
                    <Segment options={[['2', '2'], ['5', '5'], ['10', '10'], ['30', '30']].map(([v, l]) => [Number(v), l])}
                      value={settings.sync_interval_min || 5} onChange={v => saveS({ sync_interval_min: v })} />
                  </Row>
                )}
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

            {sec === 'archive' && settings && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-ink-strong">Lưu trữ mail về máy</h3>
                  <button onClick={() => setShowingArchiveDialog(true)} className="btn-primary text-sm flex items-center gap-1.5">
                    <Archive size={14} /> Lưu trữ theo folder…
                  </button>
                </div>
                <p className="text-xs text-ink-mute leading-relaxed">
                  Xuất mỗi thư ra file <code className="bg-dark-bg px-1 py-0.5 rounded">.eml</code> (định dạng chuẩn, mở lại bằng Thunderbird/Apple Mail), xoá bản sao trên Exchange để giải phóng
                  quota hộp thư FPT. Thư đã lưu trữ vẫn nằm trong danh sách và tìm kiếm; khi muốn xem mail server bấm
                  "Khôi phục" sẽ trở lại vị trí cũ (file .eml vẫn còn để backup).
                </p>
                <Row label="Thư mục lưu">
                  <div className="flex gap-2">
                    <input className={inp + ' flex-1'} value={settings.archive_path || ''} placeholder="/home/bạn/MailArchive"
                      onBlur={e => saveS({ archive_path: e.target.value })}
                      onChange={e => setSettings({ ...settings, archive_path: e.target.value })} />
                    {isElectron && (
                      <button onClick={async () => {
                        const p = await window.electron.pickFolder()
                        if (p) { saveS({ archive_path: p }); setMsg({ ok: true, text: `Đã chọn ${p}` }) }
                      }} className="btn-secondary text-sm px-3 flex items-center gap-1.5 shrink-0">
                        <FolderOpen size={14} /> Chọn…
                      </button>
                    )}
                  </div>
                </Row>
                <p className="text-[11px] text-ink-mute">Lưu ý bảo mật: thư được lưu rõ (không mã hoá) — đừng chọn thư mục chia sẻ/đồng bộ đám mây công khai.</p>
                <div className="border-t border-dark-border pt-4">
                  <h4 className="text-sm font-semibold text-ink-strong mb-2">Cấu trúc thư mục</h4>
                  <ArchiveBrowser onOpenMail={(m) => { window.dispatchEvent(new CustomEvent('mm-open-mail', { detail: m })); onClose() }} />
                </div>
                <div className="border-t border-dark-border pt-4 text-xs text-ink-mute space-y-1">
                  <p>• Trên thư đã lưu trữ, menu chuột phải có thêm <b>Khôi phục về server</b>.</p>
                  <p>• FTS index (tìm kiếm) vẫn truy vấn thư lưu trữ, nhưng chưa đọc đầy đủ nội dung .eml đã chuyển từ server (xem trực tiếp từ file đó).</p>
                </div>
              </div>
            )}

            {sec === 'autoreply' && (
              <AutoReplySection onMsg={renderMsg} />
            )}

            {sec === 'storage' && (
              <StorageSection />
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


function ArchiveDialog({ folders, onClose, onMsg }) {
  const [selectedFolders, setSelectedFolders] = useState([])
  const [beforeDate, setBeforeDate] = useState('')
  const [includeSub, setIncludeSub] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)

  const toggleFolder = (id) => {
    setSelectedFolders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleArchive = async () => {
    if (!beforeDate) { setErr('Vui lòng chọn ngày'); return }
    if (selectedFolders.length === 0) { setErr('Vui lòng chọn ít nhất một thư mục'); return }
    setBusy(true); setErr(null); setResult(null)
    try {
      const r = await api.archiveBatch({ folder_ids: selectedFolders, before_date: beforeDate, include_subfolders: includeSub })
      setResult(r)
      if (r.archived > 0) onMsg?.({ ok: true, text: `Đã lưu trữ ${r.archived} thư` })
      else onMsg?.({ ok: true, text: 'Không có thư nào cần lưu trữ' })
    } catch (e) {
      setErr(e.message)
      onMsg?.({ ok: false, text: e.message })
    } finally { setBusy(false) }
  }

  const flatFolders = []
  const walk = (nodes, depth = 0) => {
    for (const n of nodes) {
      flatFolders.push({ ...n, depth })
      if (n.children) walk(n.children, depth + 1)
    }
  }
  walk(folders)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} className="bg-dark-surface border border-dark-border rounded-xl w-[480px] max-w-[94vw] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-border shrink-0">
          <h2 className="text-sm font-semibold text-ink-strong flex items-center gap-2"><Archive size={15} /> Lưu trữ mail theo folder</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-ink-dim mb-1 block">Chọn ngày (lưu trữ thư trước ngày này)</label>
            <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)}
              className={inp} />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
            <input type="checkbox" checked={includeSub} onChange={e => setIncludeSub(e.target.checked)} />
            Bao gồm các thư mục con
          </label>
          <div>
            <label className="text-xs text-ink-dim mb-2 block">Thư mục cần lưu trữ</label>
            <div className="border border-dark-border rounded-lg max-h-48 overflow-y-auto">
              {flatFolders.filter(f => f.type !== 'system').map(f => (
                <div key={f.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-dark-hover ${selectedFolders.includes(f.id) ? 'bg-pa10' : ''}`}
                  onClick={() => toggleFolder(f.id)}>
                  <input type="checkbox" checked={selectedFolders.includes(f.id)} onChange={() => toggleFolder(f.id)} className="mr-1" />
                  <span style={{ paddingLeft: f.depth * 12 + 8 }}>{f.name}</span>
                  <span className="ml-auto text-[11px] text-ink-mute">{f.total || 0}</span>
                </div>
              ))}
            </div>
          </div>
          {err && <div className="text-xs text-red-400">{err}</div>}
          {result && (
            <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/25 rounded px-3 py-2">
              Đã lên lịch lưu trữ {result.archived} thư
              {result.error && <div className="text-red-400 mt-1">{result.error}</div>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-dark-border shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Hủy</button>
          <button onClick={handleArchive} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <L2 size={14} className="animate-spin" /> : <Archive size={14} />} Lưu trữ
          </button>
        </div>
      </div>
    </div>
  )
}
