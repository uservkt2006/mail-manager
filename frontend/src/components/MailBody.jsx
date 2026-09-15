import React, { useMemo, useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { Image as ImageIcon, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { api } from '../api'

/* Renders sanitized mail HTML Outlook-style:
   - cid: inline images resolve through the backend (fetched from Exchange once, cached on disk)
   - remote (http) images stay blocked until the user clicks "Hiện hình ảnh"
   - any image is clickable -> fullscreen viewer with wheel/button zoom */
export default function MailBody({ mailId, html, text }) {
  const [showRemote, setShowRemote] = useState(false)
  const [viewer, setViewer] = useState(null)   // {src, name}
  const [zoom, setZoom] = useState(1)

  const clean = useMemo(() => {
    if (!html) return null
    const doc = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      ADD_ATTR: ['target', 'style'],
    })
    const parsed = new DOMParser().parseFromString(doc, 'text/html')
    let hasBlocked = false
    parsed.querySelectorAll('img').forEach((im) => {
      const src = (im.getAttribute('src') || '').trim()
      if (src.toLowerCase().startsWith('cid:')) {
        const cid = src.slice(4).replace(/^[<']|[>']$/g, '')
        im.setAttribute('src', api.cidUrl(mailId, cid))
        im.setAttribute('loading', 'lazy')
      } else if (/^(https?:|\/\/)/i.test(src)) {
        im.dataset.remote = src
        im.removeAttribute('src')
        im.setAttribute('loading', 'lazy')
        hasBlocked = true
      }
    })
    return { inner: parsed.body.innerHTML, hasBlocked }
  }, [html, mailId])

  // un-block remote images by restoring saved src
  useEffect(() => {
    if (!showRemote) return
    const root = document.getElementById('mm-mail-body')
    if (!root) return
    root.querySelectorAll('img[data-remote]').forEach(im => { im.src = im.dataset.remote })
  }, [showRemote, clean])

  const onClick = useCallback((e) => {
    const t = e.target
    if (!t || t.tagName !== 'IMG') return
    const src = t.currentSrc || t.src
    if (!src) return
    setViewer({ src, name: t.alt || 'Hình ảnh' })
    setZoom(1)
  }, [])

  useEffect(() => {
    if (!viewer) return
    const onKey = (e) => { if (e.key === 'Escape') setViewer(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer])

  if (!html) return <p className="text-ink text-sm leading-relaxed whitespace-pre-wrap">{text}</p>

  return (
    <div className="relative">
      {clean?.hasBlocked && !showRemote && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs
                        bg-[#fffbe8] border-[#e6d99a] text-[#7a6520]
                        dark:bg-[#241f0b] dark:border-[#4d4426] dark:text-[#d8c583]">
          <span className="flex items-center gap-1.5"><ImageIcon size={12} /> Một số hình ảnh đã bị chặn để bảo vệ bạn.</span>
          <button onClick={() => setShowRemote(true)}
            className="font-medium text-[#a16207] dark:text-[#eab308] hover:underline whitespace-nowrap">
            Hiện hình ảnh
          </button>
        </div>
      )}
      <div id="mm-mail-body" className="mm-mail-html cursor-zoom-in"
           dangerouslySetInnerHTML={{ __html: clean ? clean.inner : '' }} onClick={onClick} />
      {viewer && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center select-none" onClick={() => setViewer(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} title="Thu nhỏ"
              className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><ZoomOut size={16} /></button>
            <span className="text-white/70 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} title="Phóng to"
              className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><ZoomIn size={16} /></button>
            <button onClick={() => setZoom(1)} title="Cỡ vừa"
              className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><RotateCcw size={14} /></button>
            <a href={viewer.src} download title="Tải ảnh"
              className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white" onClick={e => e.stopPropagation()}>
              <ImageIcon size={15} />
            </a>
            <button onClick={() => setViewer(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><X size={16} /></button>
          </div>
          <div className="w-full h-full flex items-center justify-center overflow-hidden"
               onClick={e => e.stopPropagation()}
               onWheel={e => { e.preventDefault(); setZoom(z => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.12 : 0.9)))) }}>
            <img src={viewer.src} alt={viewer.name} draggable={false}
              style={{ transform: `scale(${zoom})`, maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain',
                       transition: 'transform .12s ease-out', background: 'repeating-conic-gradient(#222 0 25%, #111 0 50%) 0 / 24px 24px' }} />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs max-w-[80vw] truncate bg-black/40 rounded px-2 py-0.5">
            {viewer.name}
          </div>
        </div>
      )}
    </div>
  )
}
