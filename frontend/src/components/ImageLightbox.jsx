import React, { useState, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon } from 'lucide-react'

/* Full-screen image viewer with zoom (shared by mail body + attachment previews). */
export default function ImageLightbox({ src, name, onClose }) {
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { setZoom(1) }, [src])

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center select-none" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={e => e.stopPropagation()}>
        <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} title="Thu nhỏ"
          className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><ZoomOut size={16} /></button>
        <span className="text-white/70 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} title="Phóng to"
          className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><ZoomIn size={16} /></button>
        <button onClick={() => setZoom(1)} title="Cỡ vừa"
          className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><RotateCcw size={14} /></button>
        <a href={src} download={name || 'anh'} title="Tải ảnh" onClick={e => e.stopPropagation()}
          className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><ImageIcon size={15} /></a>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white"><X size={16} /></button>
      </div>
      <div className="w-full h-full flex items-center justify-center overflow-hidden"
           onClick={e => e.stopPropagation()}
           onWheel={e => { e.preventDefault(); setZoom(z => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.12 : 0.9)))) }}>
        <img src={src} alt={name || ''} draggable={false}
          style={{ transform: `scale(${zoom})`, maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain',
                   transition: 'transform .12s ease-out' }} />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs max-w-[80vw] truncate bg-black/40 rounded px-2 py-0.5">
        {name}
      </div>
    </div>
  )
}
