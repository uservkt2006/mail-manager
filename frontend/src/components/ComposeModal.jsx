import React, { useState, useEffect, useRef } from 'react'
import { X, Send, Save, Paperclip, AlertTriangle, ImageIcon } from 'lucide-react'
import { api } from '../api'
import RichEditor from './RichEditor'
import { getComposeFont, getComposeSize } from '../theme'

const MODE_LABEL = { reply: 'Trả lời', reply_all: 'Trả lời tất cả', forward: 'Chuyển tiếp', new: 'New Mail' }

function fileToB64(f) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] || '')
    r.onerror = rej
    r.readAsDataURL(f)
  })
}

export default function ComposeModal({ replyTo, mode = 'reply', user, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [meta, setMeta] = useState(null)   // {thread_id, in_reply_to}
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [attachments, setAttachments] = useState([])  // {name, content_type, content_base64}
  const fileRef = useRef(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!replyTo || loadedRef.current) return
    loadedRef.current = true
    api.replyPreview(replyTo.id, mode).then(async p => {
      setTo(p.to); setCc(p.cc); setSubject(p.subject)
      setBodyHtml(p.quoted)                          // Outlook: quote preloaded
      setMeta({ thread_id: p.thread_id, in_reply_to: p.in_reply_to })
      if (p.cc) setShowCc(true)
      if (mode === 'forward') {
        try {
          const fp = await api.forwardPayload(replyTo.id)
          setAttachments(fp.attachments || [])       // originals ride along (D.6)
          setBodyHtml(fp.body ? `<br><br><div style="border-left:2px solid #4c8dff;padding-left:8px;color:#9aa4b2">
            <b>Tiêu đề:</b> ${p.subject}<br><br></div>` + fp.body : p.quoted)
        } catch { setAttachments([]) }
      }
    }).catch(e => setErr('Không tải được bản nháp: ' + e.message))
  }, [replyTo, mode])

  const addFiles = async (files) => {
    const atts = []
    for (const f of files) {
      try { atts.push({ name: f.name || `hinh-${Date.now()}.png`, content_type: f.type || 'application/octet-stream', content_base64: await fileToB64(f) }) }
      catch { /* skip unreadable */ }
    }
    if (atts.length) setAttachments(a => [...a, ...atts])
  }

  const send = async (doSend) => {
    if (doSend && !to.trim()) { setErr('Thiếu người nhận.'); return }
    if (doSend && !subject.trim()) setErr('Thiếu tiêu đề — bạn vẫn có thể gửi.')
    setBusy(true); setErr('')
    try {
      const res = await api.compose(to.trim(), subject.trim(), bodyHtml, doSend,
        { ...meta, cc: cc.trim(), bcc: bcc.trim(), attachments })
      if (doSend && res.server === false) setErr('Đã lưu local nhưng KHÔNG gửi được lên Exchange — kiểm tra mạng/EWS.')
      else onSent()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = "flex-1 bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-primary"

  return (
    <div className="fixed bottom-6 right-6 w-[580px] max-w-[94vw] bg-dark-surface border border-dark-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border">
        <h2 className="text-sm font-semibold text-ink-strong">{MODE_LABEL[mode] || 'New Mail'}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={16} /></button>
      </div>
      <div className="px-4 py-3 space-y-2 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="To" autoFocus={!replyTo} className={inputCls} />
          <button type="button" onClick={() => setShowCc(v => !v)} className="text-xs text-ink-dim hover:text-primary shrink-0">Cc</button>
          <button type="button" onClick={() => setShowBcc(v => !v)} className="text-xs text-ink-dim hover:text-primary shrink-0">Bcc</button>
        </div>
        {showCc && <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Cc" className={inputCls} />}
        {showBcc && <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="Bcc" className={inputCls} />}
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className={inputCls} />
      </div>
      {attachments.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {attachments.map((a, i) => (
            <span key={i} className="text-[11px] bg-dark-bg border border-dark-border rounded px-2 py-0.5 text-ink-dim flex items-center gap-1">
              {a.content_type?.startsWith('image/') ? <ImageIcon size={10} /> : <Paperclip size={10} />}
              <span className="max-w-[160px] truncate">{a.name}</span>
              <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))}
                className="text-ink-mute hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="px-4 pt-3 flex-1 overflow-y-auto">
        <RichEditor html={bodyHtml} onChange={setBodyHtml} onPasteFiles={addFiles}
          fontFamily={getComposeFont()} fontSize={getComposeSize()} minHeight={170} />
      </div>
      {err && (
        <div className="mx-4 my-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-1.5">
          <AlertTriangle size={13} />{err}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
        <div className="flex gap-1">
          <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Đính kèm file">
            <Paperclip size={15} />
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { addFiles([...(e.target.files || [])]); e.target.value = '' }} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => send(false)} disabled={busy} className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> Nháp
          </button>
          <button onClick={() => send(true)} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Send size={14} /> {busy ? 'Đang gửi…' : 'Gửi'}
          </button>
        </div>
      </div>
    </div>
  )
}
