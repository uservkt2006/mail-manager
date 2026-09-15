import React, { useEffect, useRef, useState } from 'react'

/* Outlook-style right-click menu. items: [{label, icon?, onClick, danger?, submenu?}] or {sep:true} */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [sub, setSub] = useState(null)   // index of open submenu

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = x, top = y
    if (left + r.width > innerWidth - 8) left = innerWidth - r.width - 8
    if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8)
    setPos({ left, top })
  }, [x, y, items])

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    const scroll = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('wheel', scroll, { passive: true })
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); window.removeEventListener('wheel', scroll) }
  }, [onClose])

  return (
    <div ref={ref} onMouseDown={e => e.stopPropagation()}
      className="fixed z-[70] min-w-[220px] bg-dark-surface border border-dark-border rounded-lg shadow-2xl py-1 text-sm select-none"
      style={{ left: pos.left, top: pos.top }}>
      {items.map((it, i) => it.sep ? (
        <div key={i} className="my-1 border-t border-dark-border" />
      ) : (
        <div key={i} className="relative" onMouseEnter={() => setSub(it.submenu ? i : null)} onMouseLeave={() => setSub(null)}>
          <button
            onClick={() => { if (!it.submenu) { it.onClick?.(); onClose() } }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-dark-hover ${it.danger ? 'text-red-400' : 'text-ink'}`}>
            {it.icon && <it.icon size={13} className="shrink-0 opacity-80" />}
            <span className="flex-1 truncate">{it.label}</span>
            {it.checked && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            {it.submenu && <span className="text-ink-mute text-xs">›</span>}
          </button>
          {it.submenu && sub === i && (
            <div className="absolute left-full -top-1 ml-0.5 min-w-[180px] bg-dark-surface border border-dark-border rounded-lg shadow-2xl py-1 z-[71]">
              {it.submenu.map((s, j) => s.sep ? <div key={j} className="my-1 border-t border-dark-border" /> : (
                <button key={j} onClick={() => { s.onClick?.(); onClose() }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-dark-hover ${s.danger ? 'text-red-400' : 'text-ink'}`}>
                  {s.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dot }} />}
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
