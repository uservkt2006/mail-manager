import React, { useState } from 'react'
import { X, Send, Save, Paperclip } from 'lucide-react'
import { api } from '../api'

export default function ComposeModal({ replyTo, user, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  React.useEffect(() => {
    if (replyTo) {
      setSubject((replyTo.subject || '').startsWith('Re:') ? replyTo.subject : 'Re: ' + (replyTo.subject || ''))
      const m = replyTo.from?.match(/<(.+)>/)
      setTo(m ? m[1] : replyTo.from || '')
    }
  }, [replyTo])

  const send = async (doSend) => {
    if (doSend && (!to.trim() || !subject.trim())) {
      setErr(!to.trim() ? 'Thiếu người nhận.' : 'Thiếu tiêu đề — gửi vẫn được nhưng người nhận khó tìm.')
      if (!to.trim()) return
    }
    setBusy(true); setErr('')
    try {
      if (doSend && replyTo) {
        await api.reply(replyTo.id, body)
      } else {
        await api.compose(to.trim(), subject.trim(), body, doSend)
      }
      onSent()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 w-[520px] max-w-[92vw] bg-dark-surface border border-dark-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[80vh]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border">
        <h2 className="text-sm font-semibold text-white">{replyTo ? 'Trả lời' : 'New Mail'}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-gray-400"><X size={16} /></button>
      </div>
      <div className="px-4 py-3 space-y-2 border-b border-dark-border">
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="To" disabled={!!replyTo}
          className="w-full bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary disabled:opacity-60" />
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
          className="w-full bg-transparent border border-dark-border rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary" />
      </div>
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Nội dung…" rows={8}
        className="flex-1 bg-transparent px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none min-h-[140px]" />
      {err && <div className="mx-4 mb-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-1.5">{err}</div>}
      <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
        <button className="p-1.5 rounded hover:bg-dark-hover text-gray-500" title="Đính kèm (qua Exchange khi kết nối tài khoản)"><Paperclip size={15} /></button>
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
