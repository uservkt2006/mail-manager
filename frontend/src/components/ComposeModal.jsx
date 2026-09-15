import React, { useState, useEffect, useRef } from 'react'
import { X, Send, Save, Paperclip, AlertTriangle } from 'lucide-react'
import { api } from '../api'

const MODE_LABEL = { reply: 'Trả lời', reply_all: 'Trả lời tất cả', forward: 'Chuyển tiếp', new: 'New Mail' }

export default function ComposeModal({ replyTo, mode = 'reply', user, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [meta, setMeta] = useState(null)   // {thread_id, in_reply_to}
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [attachments, setAttachments] = useState([])
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!replyTo || loadedRef.current) return
    loadedRef.current = true
    if (mode === 'forward') setShowCc(false)
    api.replyPreview(replyTo.id, mode).then(p => {
      setTo(p.to); setCc(p.cc); setSubject(p.subject)
      setBody(p.quoted)                          // Outlook: quote preloaded, cursor moves up as you type
      setMeta({ thread_id: p.thread_id, in_reply_to: p.in_reply_to })
      if (p.cc) setShowCc(true)
      if (mode === 'forward') {
        api.email(replyTo.id).then(d => setAttachments(d.attachments || [])).catch(() => {})
      }
    }).catch(e => setErr('Không tải được bản nháp: ' + e.message))
  }, [replyTo, mode])

  const send = async (doSend) => {
    if (doSend && !to.trim()) { setErr('Thiếu người nhận.'); return }
    if (doSend && !subject.trim()) setErr('Thiếu tiêu đề — bạn vẫn có thể gửi.')
    setBusy(true); setErr('')
    try {
      await api.compose(to.trim(), subject.trim(), body, doSend, meta || {})
      onSent()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 w-[560px] max-w-[94vw] bg-dark-surface border border-dark-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border">
        <h2 className="text-sm font-semibold text-ink-strong">{MODE_LABEL[mode] || 'New Mail'}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={16} /></button>
      </div>
      <div className="px-4 py-3 space-y-2 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="To" autoFocus={!replyTo}
            className="flex-1 bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-primary" />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-ink-dim hover:text-primary shrink-0">Cc/Bcc</button>
          )}
        </div>
        {showCc && (
          <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Cc"
            className="w-full bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-primary" />
        )}
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
          className="w-full bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-primary" />
      </div>
      {attachments.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {attachments.map(a => (
            <span key={a.id} className="text-[11px] bg-dark-bg border border-dark-border rounded px-2 py-0.5 text-ink-dim flex items-center gap-1">
              <Paperclip size={10} />{a.name}
            </span>
          ))}
        </div>
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Nội dung…"
        className="flex-1 bg-transparent px-4 py-3 text-sm text-ink placeholder-ink-mute focus:outline-none resize-none min-h-[160px]" />
      {err && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-1.5">
          <AlertTriangle size={13} />{err}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
        <button className="p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Đính kèm file (chỉ khả dụng với Exchange SMTP sau này)">
          <Paperclip size={15} />
        </button>
        <div className="flex gap-2">
          <button onClick={() => send(false)} disabled={busy} className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> Nháp
          </button>
          <button onClick={() => send(true)} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Send size={14} /> Gửi
          </button>
        </div>
      </div>
    </div>
  )
}
