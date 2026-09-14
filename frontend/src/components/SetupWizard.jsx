import React, { useState, useEffect } from 'react'
import { Mail, Check, Loader2, ArrowRight, ArrowLeft, ShieldCheck, Plug, User, AlertTriangle, FolderTree, Inbox } from 'lucide-react'
import { api, setToken } from '../api'

const STEPS = ['Hồ sơ', 'Hộp thư', 'Đồng bộ']

export default function SetupWizard({ onDone }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({
    display_name: '', local_password: '', confirm: '',
    exchange_email: '', exchange_password: '',
    server_url: 'https://mail.fpt.net/EWS/Exchange.asmx', sync_now: true
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [verify, setVerify] = useState(null)   // {success, unread, total, folders, error}
  const [result, setResult] = useState(null)   // setup response

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const canNext = step === 0
    ? f.display_name.trim().length > 1 && f.local_password.length >= 6 && f.local_password === f.confirm
    : step === 1
      ? f.exchange_email.includes('@') && f.exchange_password.length > 3
      : true

  const doVerify = async () => {
    setBusy(true); setErr(''); setVerify(null)
    try {
      const r = await api.verifyAccount({
        exchange_email: f.exchange_email.trim(), exchange_password: f.exchange_password, server_url: f.server_url.trim()
      })
      setVerify(r)
      if (!r.success) setErr(r.error || 'Không kết nối được')
    } catch (e) {
      setErr(e.message); setVerify({ success: false, error: e.message })
    } finally { setBusy(false) }
  }

  const finish = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.setup({
        display_name: f.display_name.trim(), local_password: f.local_password,
        exchange_email: f.exchange_email.trim(), exchange_password: f.exchange_password,
        server_url: f.server_url.trim(), sync_now: f.sync_now
      })
      setResult(r)
      setToken(r.token)
      setTimeout(() => onDone(r.user), 1400)
    } catch (e) {
      setErr(e.message)
      setStep(1)
    } finally { setBusy(false) }
  }

  const next = () => {
    setErr('')
    if (step === 0) setStep(1)
    else if (step === 1) { setStep(2); finish() }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-dark-bg overflow-y-auto py-8">
      <div className="w-[560px] max-w-[94vw]">
        {/* brand */}
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-[0_8px_24px_rgba(76,141,255,0.25)]">
            <Mail size={22} className="text-ink-strong" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink-strong leading-tight">Mail Manager</h1>
            <p className="text-xs text-ink-dim">Thiết lập ban đầu · Exchange FPT</p>
          </div>
        </div>

        {/* stepper */}
        <div className="flex items-center gap-2 mb-6 px-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-colors ${
                  i < step ? 'bg-green-500 text-ink-strong' : i === step ? 'bg-primary text-ink-strong' : 'bg-dark-surface text-ink-mute border border-dark-border'}`}>
                  {i < step ? <Check size={13} /> : i + 1}
                </div>
                <span className={`text-xs ${i === step ? 'text-ink-strong font-medium' : 'text-ink-mute'}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-green-500/50' : 'bg-dark-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-pa10 border border-pa25 rounded-lg">
                <User size={16} className="text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-ink-dim leading-relaxed">
                  Đây là <b className="text-ink">hồ sơ trên máy bạn</b> — dùng để khóa ứng dụng và tách dữ liệu
                  giữa những người dùng chung máy. Mật khẩu được băm PBKDF2, không ai khác thấy hộp thư của bạn.
                </p>
              </div>
              <Field label="Tên hiển thị" hint="Hiện ở góc trên, và trong chữ ký">
                <input autoFocus value={f.display_name} onChange={set('display_name')} placeholder="Võ Khắc Tâm"
                  className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mật khẩu máy này" hint="Tối thiểu 6 ký tự">
                  <input type="password" value={f.local_password} onChange={set('local_password')} className={inp} />
                </Field>
                <Field label="Nhập lại">
                  <input type="password" value={f.confirm} onChange={set('confirm')} className={inp} />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-pa10 border border-pa25 rounded-lg">
                <Plug size={16} className="text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-ink-dim leading-relaxed">
                  Kết nối hộp thư Exchange. Mật khẩu được <b className="text-ink">mã hóa Fernet</b> khi lưu,
                  chỉ dùng để gọi EWS. Quá trình này chỉ <b className="text-ink">đọc</b> — không gửi hay sửa mail nào.
                </p>
              </div>
              <Field label="Email công việc">
                <input type="email" value={f.exchange_email} onChange={set('exchange_email')} placeholder="ten@fpt.net" className={inp} />
              </Field>
              <Field label="Mật khẩu Exchange">
                <input type="password" value={f.exchange_password} onChange={set('exchange_password')} className={inp} />
              </Field>
              <Field label="EWS URL" hint="Đổi nếu công ty bạn dùng server khác">
                <input value={f.server_url} onChange={set('server_url')} className={inp + ' text-xs'} />
              </Field>

              <button onClick={doVerify} disabled={busy || !canNext}
                className="btn-secondary text-sm w-full py-2 flex items-center justify-center gap-2 disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Kiểm tra kết nối
              </button>

              {verify && verify.success && (
                <div className="p-3 bg-green-500/8 border border-green-500/25 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
                    <Check size={14} /> Kết nối thành công
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-dark-bg rounded px-2.5 py-1.5 flex items-center gap-2">
                      <Inbox size={12} className="text-ink-dim" />
                      <span className="text-ink-dim">Tổng:</span><b className="text-ink-strong">{verify.total ?? '—'}</b>
                    </div>
                    <div className="bg-dark-bg rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-ink-dim">Chưa đọc:</span><b className="text-ink-strong">{verify.unread ?? '—'}</b>
                    </div>
                  </div>
                  {verify.folders?.length > 0 && (
                    <div className="text-[11px] text-ink-dim flex items-start gap-1.5">
                      <FolderTree size={12} className="mt-0.5 shrink-0" />
                      <span>{verify.folders.slice(0, 6).join(', ')}{verify.folders.length > 6 ? ` +${verify.folders.length - 6}` : ''}</span>
                    </div>
                  )}
                </div>
              )}
              {verify && !verify.success && (
                <div className="flex items-start gap-2 p-3 bg-red-500/8 border border-red-500/25 rounded-lg text-xs text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{verify.error}</span>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="py-6 text-center">
              {!result && !err ? (
                <>
                  <Loader2 size={30} className="animate-spin text-primary mx-auto mb-4" />
                  <p className="text-sm text-ink font-medium">Đang đồng bộ hộp thư…</p>
                  <p className="text-xs text-ink-mute mt-1">Mail 60 thư gần nhất · lịch 14 ngày tới · danh bạ</p>
                </>
              ) : result ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                    <Check size={22} className="text-green-400" />
                  </div>
                  <p className="text-sm text-ink-strong font-medium mb-3">Sẵn sàng — chào {result.user.display_name}</p>
                  {result.sync && !result.sync.error && (
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[['Mail', result.sync.messages], ['Chủ đề', result.sync.threads],
                        ['Lịch', result.sync.events], ['Danh bạ', result.sync.contacts]].map(([k, v]) => (
                        <div key={k} className="bg-dark-bg border border-dark-border rounded-lg py-2.5">
                          <div className="text-lg font-semibold text-primary">{v ?? 0}</div>
                          <div className="text-[10px] text-ink-mute uppercase tracking-wide">{k}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.sync?.error && (
                    <p className="text-xs text-amber-400 mt-2">Đồng bộ lỗi: {result.sync.error} — bạn vẫn vào được, bấm “Làm mới” sau.</p>
                  )}
                </>
              ) : null}
            </div>
          )}

          {err && step !== 2 && (
            <div className="mt-4 flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />{err}
            </div>
          )}
        </div>

        {/* nav */}
        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}
            className="text-sm text-ink-dim hover:text-ink flex items-center gap-1.5 disabled:opacity-30 px-2 py-1.5">
            <ArrowLeft size={15} /> Quay lại
          </button>
          {step < 2 ? (
            <button onClick={next} disabled={!canNext || busy}
              className="btn-primary text-sm flex items-center gap-2 px-5 py-2 disabled:opacity-40">
              {step === 1 ? 'Tạo & đồng bộ' : 'Tiếp tục'} <ArrowRight size={15} />
            </button>
          ) : (
            <button onClick={() => result && onDone(result.user)} disabled={!result}
              className="btn-primary text-sm flex items-center gap-2 px-5 py-2 disabled:opacity-40">
              Vào ứng dụng <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const inp = "w-full bg-dark-bg border border-dark-border rounded-md px-3.5 py-2.5 text-sm text-ink-strong placeholder-gray-600 focus:outline-none focus:border-primary"

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-dim mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-mute mt-1">{hint}</p>}
    </div>
  )
}
