import React, { useState, useEffect, useRef } from 'react'
import { X, Send, Save, Paperclip, Trash2, AlertTriangle, ChevronDown, Image as ImageIcon, Minus, Square } from 'lucide-react'
import { api } from '../api'
import RichEditor from './RichEditor'
import RecipientInput from './RecipientInput'
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
const human = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B'

export default function ComposeModal({ replyTo, mode = 'reply', user, onClose, onSent }) {
  const [to, setTo] = useState([])
  const [cc, setCc] = useState([])
  const [bcc, setBcc] = useState([])
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [meta, setMeta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [attachments, setAttachments] = useState([])
  const [minimized, setMinimized] = useState(false)
  const fileRef = useRef(null)
  const loadedRef = useRef(false)
  const sigLoadedRef = useRef(false)
  const sigAddedRef = useRef(false)   // track OUR sig insertion (quoted text may contain old data-sig divs!)
  const bodyRef = useRef(null)
  const sigRef = useRef('')

  const sigId = useRef('sig' + Math.random().toString(36).slice(2, 8))
  const sigBlock = () => {
    const html = sigRef.current
    if (!html) return ''
    return `<div class="mm-sig" data-sig="${sigId.current}"><br>--&nbsp;<br>${html}</div>`
  }

  const loadSig = async () => {
    if (sigLoadedRef.current) return sigRef.current
    sigLoadedRef.current = true
    try {
      const d = await api.settings()
      sigRef.current = d.settings?.signature_html
        || (d.settings?.signature || '').replace(/\n/g, '<br>')
    } catch { sigRef.current = '' }
    return sigRef.current
  }
  useEffect(() => {
    if (replyTo) return
    loadSig().then(sig => {
      if (sig) {
        sigAddedRef.current = true
        setBodyHtml(sigBlock())
        setTimeout(() => {
          const ed = bodyRef.current?.querySelector('[contenteditable]')
          if (ed) {
            ed.focus()
            const range = document.createRange()
            range.selectNodeContents(ed); range.collapse(true)
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
          }
        }, 120)
      }
    })
  }, [replyTo])   // eslint-disable-line

  useEffect(() => {
    if (!replyTo || loadedRef.current) return
    loadedRef.current = true
    api.replyPreview(replyTo.id, mode).then(async p => {
      const split = (s) => (s || '').split(/,(?![^<]*>)/).map(x => x.trim()).filter(Boolean)
      setTo(split(p.to)); setCc(split(p.cc))
      if (p.cc) setShowCcBcc(true)
      setSubject(p.subject)
      setMeta({ thread_id: p.thread_id, in_reply_to: p.in_reply_to })
      let quoted = p.quoted || ''
      if (mode === 'forward') {
        try {
          const fp = await api.forwardPayload(replyTo.id)
          setAttachments(fp.attachments || [])
          quoted = (fp.body ? fp.body + '<br><br>' : '') + quoted
        } catch { /* keep quote only */ }
      }
      // Outlook placement: [chữ ký][quote], cursor at top. Use our own sigId marker
      // — quoted chains may contain data-sig from earlier app-sent mails (must not
      // suppress the fresh signature insert).
      loadSig().then(sig => {
        sigAddedRef.current = !!sig
        setBodyHtml(sig ? sigBlock() + quoted : quoted)
        setTimeout(() => {
          const ed = bodyRef.current?.querySelector('[contenteditable]')
          if (ed) {
            ed.focus()
            const range = document.createRange()
            range.selectNodeContents(ed)
            range.collapse(true)
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
          }
        }, 120)
      })
    }).catch(e => setErr('Không tải được bản nháp: ' + e.message))
  }, [replyTo, mode])

  // signature: append into body (like the screenshot), removable/editable
  const addSignature = async () => {
    const sig = await loadSig()
    if (!sig) { setErr('Chưa có chữ ký — vào Cài đặt → Chữ ký để tạo.'); return }
    const wrapped = sigBlock()
    const ed = bodyRef.current?.querySelector('[contenteditable]')
    if (ed && !ed.innerHTML.includes('data-sig')) {
      ed.focus()
      document.execCommand('insertHTML', false, wrapped)
      setBodyHtml(ed.innerHTML)
    } else if (!ed) setBodyHtml(b => b.includes('data-sig') ? b : b + wrapped)
  }

  const addFiles = async (files) => {
    const atts = []
    for (const f of files) {
      try {
        atts.push({ name: f.name || `hinh-${Date.now()}.png`, content_type: f.type || 'application/octet-stream',
          size: f.size, content_base64: await fileToB64(f) })
      } catch { /* skip */ }
    }
    if (atts.length) setAttachments(a => [...a, ...atts])
  }

  const send = async (doSend) => {
    if (doSend && !to.length) { setErr('Thiếu người nhận.'); return }
    setBusy(true); setErr('')
    try {
      const res = await api.compose(to.join(', '), subject.trim(), bodyHtml, doSend,
        { ...meta, cc: cc.join(', '), bcc: bcc.join(', '), sig_added: !!sigAddedRef.current,
          attachments: doSend ? attachments.map(({ name, content_type, content_base64 }) => ({ name, content_type, content_base64 })) : [] })
      if (doSend && res.server === false) {
        setErr('Đã lưu nhưng KHÔNG gửi được qua Exchange — kiểm tra mạng rồi gửi lại.')
        setBusy(false); return
      }
      onSent()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 w-[320px] bg-dark-surface border border-dark-border border-b-0 rounded-t-lg shadow-2xl z-50 flex items-center justify-between px-3.5 py-2.5 cursor-pointer"
        onClick={() => setMinimized(false)}>
        <div className="min-w-0">
          <div className="text-sm text-ink-strong truncate">{subject || MODE_LABEL[mode]}</div>
          {to.length > 0 && <div className="text-[11px] text-ink-mute truncate"> tới {to.map(x => x.split('<')[0].trim()).join(', ')}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); send(true) }} disabled={busy} className="p-1.5 rounded hover:bg-dark-hover text-primary" title="Gửi"><Send size={14} /></button>
          <button onClick={e => { e.stopPropagation(); setMinimized(false) }} className="p-1.5 rounded hover:bg-dark-hover text-ink-dim" title="Khôi phục"><Square size={12} /></button>
          <button onClick={e => { e.stopPropagation(); onClose() }} className="p-1.5 rounded hover:bg-dark-hover text-ink-dim"><X size={14} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[640px] bg-dark-surface border border-dark-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[92vh]">
      {/* title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border shrink-0">
        <h2 className="text-sm font-semibold text-ink-strong">{MODE_LABEL[mode] || 'New Mail'}</h2>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setMinimized(true)} className="p-1.5 rounded hover:bg-dark-hover text-ink-dim" title="Thu nhỏ"><Minus size={14} /></button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-hover text-ink-dim" title="Đóng"><X size={15} /></button>
        </div>
      </div>

      {/* recipients block — Outlook style: rows with labels */}
      <div className="px-3 py-2 space-y-0.5 border-b border-dark-border shrink-0">
        <RecipientInput label="Đến" value={to} onChange={setTo} autoFocus={!replyTo} placeholder="Nhập tên hoặc email…" />
        {cc.length === 0 && bcc.length === 0 && !showCcBcc && (
          <div className="flex justify-end pr-1 -mb-1">
            <button type="button" onClick={() => { setCc([]); setBcc([]); setShowCcBcc(true) }}
              className="text-[11px] text-ink-dim hover:text-primary flex items-center gap-1 py-0.5">Cc/Bcc <ChevronDown size={10} /></button>
          </div>
        )}
        {(showCcBcc || cc.length > 0) && <RecipientInput label="Cc" value={cc} onChange={setCc} />}
        {(showCcBcc || bcc.length > 0) && <RecipientInput label="Bcc" value={bcc} onChange={setBcc} />}
      </div>

      {/* subject */}
      <div className="px-3 pt-2 shrink-0">
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Thêm chủ đề"
          className="w-full bg-transparent text-[15px] text-ink-strong placeholder-ink-mute focus:outline-none py-1.5" />
      </div>

      {/* attachments chips */}
      {attachments.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto shrink-0">
          {attachments.map((a, i) => (
            <span key={i} className="text-[11px] bg-dark-bg border border-dark-border rounded-md px-2 py-1 text-ink-dim flex items-center gap-1.5">
              {a.content_type?.startsWith('image/') ? <ImageIcon size={11} /> : <Paperclip size={11} />}
              <span className="max-w-[150px] truncate">{a.name}</span>
              <span className="text-ink-mute">{human(a.size || Math.round((a.content_base64 || '').length * 0.75))}</span>
              <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))} className="hover:text-red-400"><Trash2 size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* editor */}
      <div ref={bodyRef} className="px-3 pt-2 flex-1 min-h-0 flex flex-col">
        <RichEditor html={bodyHtml} onChange={setBodyHtml} onPasteFiles={addFiles}
          fontFamily={getComposeFont()} fontSize={getComposeSize()} minHeight={200}
          placeholder="Nội dung… (dán ảnh hoặc kéo thả tệp vào đây)" toolbarBottom />
      </div>

      {err && (
        <div className="mx-3 mt-2 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-1.5 shrink-0">
          <AlertTriangle size={13} />{err}
        </div>
      )}

      {/* action bar */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-t border-dark-border shrink-0">
        <button onClick={() => send(true)} disabled={busy}
          className="btn-primary text-sm flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 rounded-full">
          <Send size={13} /> {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
        <button onClick={() => send(false)} disabled={busy} className="text-sm text-ink-dim hover:text-ink px-2.5 py-1.5">
          Lưu nháp
        </button>
        <span className="w-px h-5 bg-dark-border mx-1" />
        <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Đính kèm tệp"><Paperclip size={15} /></button>
        <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Chèn ảnh"><ImageIcon size={15} /></button>
        <input ref={fileRef} type="file" multiple accept="image/*,*/*" className="hidden"
          onChange={e => { addFiles([...(e.target.files || [])]); e.target.value = '' }} />
        <button onClick={addSignature} className="text-[12px] text-ink-dim hover:text-primary px-2 py-1 rounded hover:bg-dark-hover" title="Chèn chữ ký">
          Chữ ký
        </button>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Bỏ thư"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}
