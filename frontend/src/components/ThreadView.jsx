import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Star, Archive, Trash2, Reply, ReplyAll, Forward, Download, Paperclip, Loader2 } from 'lucide-react'
import { api } from '../api'
import MailBody from './MailBody'
import ImageLightbox from './ImageLightbox'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

/* Outlook-style conversation: newest message expanded, older ones collapsed cards. */
export default function ThreadView({ threadId, folders, onArchive, onDelete, onStar, onReply, onEmailOpen, onEnded }) {
  const [msgs, setMsgs] = useState(null)
  const [openIds, setOpenIds] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    api.thread(threadId).then(d => {
      const list = (d.messages || []).slice().reverse()   // newest first
      setMsgs(list)
      setOpenIds(list.length ? [list[0].id] : [])
      // hydrate empties then refetch once so bodies fill in without a reload
      if (list.some(m => !m.body && !m.html_body)) {
        setTimeout(() => api.thread(threadId).then(d2 => {
          const l2 = (d2.messages || []).slice().reverse()
          if (l2.some(m => m.body || m.html_body)) setMsgs(l2)
        }), 3500)
      }
    }).catch(() => setMsgs([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [threadId])

  if (loading && !msgs) return <div className="h-full flex items-center justify-center text-ink-mute"><Loader2 size={18} className="animate-spin" /></div>
  if (!msgs || !msgs.length) return <div className="h-full flex items-center justify-center text-ink-mute text-sm">Không có thư trong hội thoại</div>

  const latest = msgs[0]
  const toggle = (id) => setOpenIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <div className="w-full h-full bg-dark-bg flex flex-col overflow-hidden">
      <div className="h-11 flex-shrink-0 border-b border-dark-border flex items-center gap-1 px-3">
        <button onClick={() => onReply('reply', latest)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"><Reply size={13} /> Trả lời</button>
        <button onClick={() => onReply('reply_all', latest)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"><ReplyAll size={13} /> Tất cả</button>
        <button onClick={() => onReply('forward', latest)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"><Forward size={13} /> Chuyển tiếp</button>
        <div className="flex-1" />
        <span className="text-[11px] text-ink-mute">{msgs.length} thư</span>
        <button onClick={() => onStar(latest.id)} className="p-1.5 rounded hover:bg-dark-hover"><Star size={15} className={latest.starred ? 'text-yellow-400 fill-current' : 'text-ink-dim'} /></button>
        <button onClick={() => onArchive(latest.id)} className="p-1.5 rounded hover:bg-dark-hover" title="Lưu trữ"><Archive size={15} className="text-ink-dim" /></button>
        <button onClick={() => onDelete(latest.id)} className="p-1.5 rounded hover:bg-dark-hover" title="Xóa"><Trash2 size={15} className="text-ink-dim" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 pb-2">
          <h1 className="text-lg font-semibold text-ink-strong">{latest.subject}</h1>
        </div>
        {msgs.map((m, i) => {
          const open = openIds.includes(m.id)
          const sender = (m.from || '').split('<')[0].trim() || m.from
          const atts = m.attachments || []
          return (
            <div key={m.id} className={`mx-4 mb-2 rounded-lg border ${open ? 'border-pa40 bg-dark-surface' : 'border-dark-border bg-dark-surface/60'} overflow-hidden`}>
              <button className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-dark-hover" onClick={() => toggle(m.id)}>
                {open ? <ChevronDown size={13} className="text-ink-mute shrink-0" /> : <ChevronRight size={13} className="text-ink-mute shrink-0" />}
                <div className="w-7 h-7 rounded-full bg-pa20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                  {(sender || '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-medium text-ink-strong">{sender}</span>
                  {!open && (
                    <span className="text-xs text-ink-mute ml-2 truncate">
                      {(m.body || m.html_body || '').replace(/<[^>]*>/g, ' ').slice(0, 90)}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-ink-mute shrink-0 flex items-center gap-2">
                  {atts.length > 0 && <Paperclip size={10} />}
                  {fmtDate(m.date)}
                </span>
              </button>
              {open && (
                <div className="border-t border-dark-border">
                  {m.to && <div className="px-4 pt-2 text-[11px] text-ink-mute truncate"><b className="text-ink-dim">Tới:</b> {(m.to || '').split(/,(?![^<]*>)/).map(x => x.split('<')[0].trim()).join(', ')}</div>}
                  {m.cc && <div className="px-4 pt-0.5 text-[11px] text-ink-mute truncate"><b className="text-ink-dim">Cc:</b> {(m.cc || '').split(/,(?![^<]*>)/).map(x => x.split('<')[0].trim()).join(', ')}</div>}
                  {atts.length > 0 && (
                    <div className="px-4 py-2 flex flex-wrap gap-1.5">
                      {atts.map(a => (
                        (a.mime_type || '').startsWith('image/') ? (
                          <button key={a.id} onClick={() => setPreview({ ...a, mid: m.id })} title={`${a.name} — xem`}
                            className="rounded overflow-hidden border border-dark-border hover:border-primary/60" style={{ width: 84, height: 62 }}>
                            <img src={api.attachmentThumbUrl(m.id, a.id)} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <a key={a.id} href={api.attachmentUrl(m.id, a.id)} download={a.name} title="Tải về"
                            className="flex items-center gap-1.5 text-[11px] bg-dark-bg border border-dark-border rounded px-2 py-1 text-ink-dim hover:border-primary/60">
                            <Paperclip size={10} /><span className="max-w-[140px] truncate">{a.name}</span>
                            {a.size ? <span className="text-ink-mute">{Math.round(a.size / 1024)} KB</span> : null}
                          </a>
                        )
                      ))}
                    </div>
                  )}
                  <div className="px-5 py-3 max-h-[46vh] overflow-y-auto">
                    <MailBody mailId={m.id} html={m.html_body} text={m.body} />
                  </div>
                  <div className="px-4 pb-3 flex gap-2">
                    <button onClick={() => onReply('reply', m)} className="btn-secondary text-xs py-1">Trả lời</button>
                    <button onClick={() => onReply('reply_all', m)} className="btn-secondary text-xs py-1">Tất cả</button>
                    {i === 0 && onEmailOpen && <button onClick={() => onEmailOpen(m)} className="text-xs text-ink-mute hover:text-primary py-1 ml-auto">Mở toàn màn hình</button>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div className="h-4" />
      </div>
      {preview && <ImageLightbox src={api.attachmentUrl(preview.mid, preview.id)} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  )
}
