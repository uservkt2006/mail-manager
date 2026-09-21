import React, { useState, useEffect, useMemo } from 'react'
import { Archive, Trash2, Star, Reply, ReplyAll, Forward, Flag, CheckSquare, Paperclip, Tags, ChevronDown, Download, ExternalLink } from 'lucide-react'
import DOMPurify from 'dompurify'
import MailBody from './MailBody'
import ImageLightbox from './ImageLightbox'
import { api } from '../api'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function shortNames(s) {
  return (s || '').split(/,(?![^<]*>)/).map(x => (x.split('<')[0].trim() || x)).filter(Boolean).slice(0, 3).join(', ')
}

export default function EmailDetail({ email, folders, onArchive, onDelete, onStar, onFlag, onMove, onCreateTask, onReply, onRefresh }) {
  // onReply(mode) — 'reply' | 'reply_all' | 'forward'
  const [catMeta, setCatMeta] = useState({ categories: [], colors: {} })
  const [full, setFull] = useState(null)
  const [showCats, setShowCats] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [showRecips, setShowRecips] = useState(false)
  const [preview, setPreview] = useState(null)   // attachment image -> lightbox
  const [badThumb, setBadThumb] = useState([])   // thumb 404s -> fall back to download chip

  useEffect(() => { api.categories().then(setCatMeta).catch(() => {}) }, [])
  useEffect(() => {
    if (email?.id) {
      setFull(null)
      let alive = true
      let tries = 10
      const load = () => {
        api.email(email.id).then(d => {
          if (!alive) return
          setFull(d)
          onRefresh?.()
          if (d.hydrating && tries > 0) {
            // Poll faster at first, then slow down
            const delay = tries > 6 ? 600 : 1500
            setTimeout(() => { tries--; load() }, delay)
          }
        }).catch(() => { if (alive) setFull(null) })
      }
      load()
      return () => { alive = false }
    }
  }, [email?.id])

  if (!email) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-dark-bg text-ink-mute">
        <div className="text-center">
          <Archive size={44} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm">Chọn một thư để đọc tại đây</p>
        </div>
      </div>
    )
  }

  const m = full || email
  const cats = Array.isArray(m.categories) ? m.categories : []
  const atts = m.attachments || []

  const toggleCat = async (cat) => {
    const next = cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat]
    await api.setCats(email.id, next)
    setFull({ ...m, categories: next })
  }

  const setDue = (days) => {
    const d = new Date(Date.now() + days * 864e5); d.setHours(17, 0, 0, 0)
    onFlag(email.id, d.toISOString())
  }

  return (
    <div className="w-full h-full bg-dark-bg flex flex-col overflow-hidden min-w-0">
      {/* contextual toolbar */}
      <div className="h-11 flex-shrink-0 border-b border-dark-border flex items-center gap-1 px-3">
        <button onClick={() => onReply('reply')} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
          <Reply size={13} /> Trả lời
        </button>
        <button onClick={() => onReply('reply_all')} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5" title="Trả lời tất cả (A)">
          <ReplyAll size={13} /> Tất cả
        </button>
        <button onClick={() => onReply('forward')} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5" title="Chuyển tiếp (F)">
          <Forward size={13} /> Chuyển tiếp
        </button>
        <div className="relative">
          <button onClick={() => setShowMove(!showMove)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
            <Archive size={13} /> Di chuyển <ChevronDown size={11} />
          </button>
          {showMove && (
            <div className="absolute top-full mt-1 left-0 bg-dark-surface border border-dark-border rounded-md shadow-xl z-40 py-1 w-52 max-h-72 overflow-y-auto">
              {(folders || []).flatMap(function flat(n) { return [n, ...(n.children || []).flatMap(flat)] })
                .filter(f => f.id !== m.folder_id)
                .map(f => (
                  <button key={f.id} onClick={() => { setShowMove(false); onMove(email.id, f.id) }}
                    className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-dark-hover">{f.name}</button>
                ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => onFlag(email.id, m.flag_due ? null : new Date(Date.now() + 3 * 864e5).toISOString())}
            className={`btn-secondary text-xs flex items-center gap-1.5 py-1.5 ${m.flag_due ? 'text-primary border-pa40' : ''}`}>
            <Flag size={13} /> Cờ
          </button>
        </div>
        <button onClick={() => onCreateTask(email.id)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
          <CheckSquare size={13} /> Thành công việc
        </button>
        <button onClick={() => setShowCats(!showCats)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
          <Tags size={13} /> Phân loại
        </button>
        <div className="flex-1" />
        <button onClick={() => {
          // Desktop (Electron): pop into a separate native window. Browser fallback: open in new tab.
          if (window.electron?.openMailWindow) {
            window.electron.openMailWindow(email.id, m.subject || 'Mail')
          } else {
            window.open(`/?mail=${encodeURIComponent(email.id)}`, '_blank', 'noopener,width=900,height=720')
          }
        }} className="p-1.5 rounded hover:bg-dark-hover" title="Mở trong cửa sổ riêng">
          <ExternalLink size={14} className="text-ink-dim" />
        </button>
        <button onClick={() => onStar(email.id)} className="p-1.5 rounded hover:bg-dark-hover">
          <Star size={15} className={email.starred ? 'text-yellow-400 fill-current' : 'text-ink-dim'} />
        </button>
        <button onClick={() => onArchive(email.id)} className="p-1.5 rounded hover:bg-dark-hover" title="Lưu trữ (A)">
          <Archive size={15} className="text-ink-dim" />
        </button>
        <button onClick={() => onDelete(email.id)} className="p-1.5 rounded hover:bg-dark-hover" title="Xóa (D)">
          <Trash2 size={15} className="text-ink-dim" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-4">
          <h1 className="text-xl font-semibold text-ink-strong mb-4">{m.subject}</h1>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pa20 text-primary flex items-center justify-center font-semibold shrink-0">
              {(m.from || '?').trim()[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink-strong text-sm truncate">{(m.from || '').split('<')[0].trim() || m.from}</div>
              <div className="text-xs text-ink-dim truncate">
                {fmtDate(m.date)}
                {m.to && <> · <span className="text-ink-mute">Tới:</span> {shortNames(m.to)}</>}
                {m.cc && <> · <span className="text-ink-mute">Cc:</span> {shortNames(m.cc)}</>}
                {m.bcc && <> · <span className="text-ink-mute">Bcc:</span> {shortNames(m.bcc)}</>}
              </div>
              {(m.cc || m.bcc) && (
                <button onClick={() => setShowRecips(v => !v)} className="text-[11px] text-primary hover:underline mt-0.5">
                  {showRecips ? 'Ẩn người nhận' : 'Hiện chi tiết người nhận'}
                </button>
              )}
              {showRecips && (
                <div className="text-[11px] text-ink-mute mt-1 space-y-0.5 break-all">
                  {m.to && <div><b className="text-ink-dim">Tới:</b> {m.to}</div>}
                  {m.cc && <div><b className="text-ink-dim">Cc:</b> {m.cc}</div>}
                  {m.bcc && <div><b className="text-ink-dim">Bcc:</b> {m.bcc}</div>}
                </div>
              )}
              {m.flag_due && (
                <div className="text-xs text-primary mt-0.5 flex items-center gap-1">
                  <Flag size={10} /> Follow-up: {fmtDate(m.flag_due)}
                </div>
              )}
            </div>
          </div>

          {cats.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {cats.map(c => (
                <span key={c} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: (catMeta.colors[c] || '#4c8dff') + '22', color: catMeta.colors[c] || '#4c8dff' }}>
                  {c}
                </span>
              ))}
            </div>
          )}

          {showCats && (
            <div className="mt-3 p-3 bg-dark-surface border border-dark-border rounded-lg flex flex-wrap gap-2">
              {catMeta.categories.map(c => (
                <button key={c} onClick={() => toggleCat(c)}
                  className="px-2.5 py-1 rounded-full text-xs border"
                  style={{
                    borderColor: (catMeta.colors[c] || '#4c8dff') + '55',
                    backgroundColor: cats.includes(c) ? (catMeta.colors[c] || '#4c8dff') : 'transparent',
                    color: cats.includes(c) ? 'white' : (catMeta.colors[c] || '#9ca3af')
                  }}>{c}</button>
              ))}
            </div>
          )}
        </div>

        {atts.length > 0 && (
          <div className="mx-6 mb-4 p-3 bg-dark-surface border border-dark-border rounded-lg">
            <div className="text-[11px] uppercase tracking-wider text-ink-dim font-semibold mb-2">
              <Paperclip size={11} className="inline mr-1" />{atts.length} đính kèm
            </div>
            <div className="flex flex-wrap gap-2">
              {atts.map(a => {
                const isImg = (a.mime_type || '').startsWith('image/') && !badThumb.includes(a.id)
                if (isImg) {
                  return (
                    <button key={a.id} onClick={() => setPreview(a)}
                      className="group relative rounded-md overflow-hidden border border-dark-border hover:border-primary/60 bg-dark-bg"
                      title={`${a.name} — bấm để xem`}
                      style={{ width: 132, height: 96 }}>
                      <img src={api.attachmentThumbUrl(m.id, a.id)} alt={a.name} loading="lazy"
                        onError={() => setBadThumb(s => [...new Set([...s, a.id])])}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <span className="absolute bottom-0 inset-x-0 text-[10px] px-1.5 py-0.5 truncate bg-black/60 text-white/90">{a.name}</span>
                    </button>
                  )
                }
                return (
                <a key={a.id} href={api.attachmentUrl(m.id, a.id)} download={a.name}
                  className="flex items-center gap-2 bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 hover:border-primary/60"
                  title="Tải về">
                  <div className="w-6 h-6 rounded bg-pa15 text-primary flex items-center justify-center text-[10px] font-bold uppercase">
                    {(a.name || '?').split('.').pop()}
                  </div>
                  <div className="text-xs">
                    <div className="text-ink">{a.name}</div>
                    <div className="text-ink-mute">{a.size ? `${Math.round(a.size / 1024)} KB` : ''}</div>
                  </div>
                  <Download size={12} className="text-ink-mute" />
                </a>
                )
              })}
            </div>
          </div>
        )}
        {preview && <ImageLightbox src={api.attachmentUrl(m.id, preview.id)} name={preview.name} onClose={() => setPreview(null)} />}

        <div className="px-6 pb-8">
          <MailBody mailId={m.id} html={m.html_body} text={m.body} />
        </div>
      </div>
    </div>
  )
}
