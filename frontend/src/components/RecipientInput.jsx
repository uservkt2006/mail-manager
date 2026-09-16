import React, { useState, useRef, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { api } from '../api'

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const fmt = (s) => (s && s.includes('<') ? s : s)

/* One recipient row: chips + free text input with contact suggestions.
   value: string[] of "Name <a@b>" ; onChange(next[]) */
export default function RecipientInput({ label, value, onChange, placeholder = 'Nhập tên hoặc email…', autoFocus, required, accent }) {
  const [text, setText] = useState('')
  const [sug, setSug] = useState([])
  const [hi, setHi] = useState(0)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const inpRef = useRef(null)
  const boxRef = useRef(null)

  const commit = (raw) => {
    const t = raw.trim().replace(/[,;]+$/, '').trim()
    if (!t) return
    onChange([...value, fmt(t)])
    setText(''); setSug([])
  }

  useEffect(() => {
    const q = text.trim()
    if (q.length < 2 || EMAIL_RE.test(q) && !q.includes(' ')) {
      if (!(q.length >= 2)) { setSug([]); return }
    }
    if (q.length < 2) { setSug([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.suggest(q).then(d => {
        const seen = new Set(value.map(v => (v.match(/<([^>]+)>/) || [0, v.toLowerCase()])[1].toLowerCase()))
        setSug((d.suggestions || []).filter(s => !seen.has(s.email.toLowerCase())))
        setHi(0)
      }).catch(() => setSug([])).finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [text])   // eslint-disable-line

  const addSug = (s) => {
    onChange([...value, `${s.name && s.name !== s.email ? s.name : ''}${s.name && s.name !== s.email ? ' ' : ''}<${s.email}>`].map(x => x.trim()))
    setText(''); setSug([])
    inpRef.current?.focus()
  }

  const onKey = (e) => {
    if (sug.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setHi(h => (e.key === 'ArrowDown' ? (h + 1) % sug.length : (h - 1 + sug.length) % sug.length))
    } else if (e.key === 'Enter' || e.key === ',') {
      if (sug.length) { e.preventDefault(); addSug(sug[hi]); return }
      if (text.trim()) { e.preventDefault(); commit(text) }
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && !text && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Tab' && sug.length) {
      e.preventDefault(); addSug(sug[hi])
    } else if (e.key === 'Escape') {
      setSug([])
    }
  }

  const onBlur = (e) => {
    if (boxRef.current?.contains(e.relatedTarget)) return
    if (text.trim()) commit(text)
    setFocused(false)
  }

  const initials = (v) => {
    const m = v.match(/<([^>]+)>/)
    const disp = (v.split('<')[0].trim() || m?.[1] || '?').trim()
    const parts = disp.split(/\s+/)
    return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || '?'
  }
  const displayName = (v) => (v.includes('<') ? v.split('<')[0].trim() : v.match(/^[^@]+/)?.[0]?.replace(/[._]/g, ' ').trim() || v)

  return (
    <div ref={boxRef} className="relative flex items-start gap-2">
      <span className={`w-10 shrink-0 text-xs pt-2 text-right ${accent ? 'text-ink-dim' : 'text-ink-mute'}`}>{label}</span>
      <div className={`flex-1 flex flex-wrap items-center gap-1.5 border rounded-md px-2 py-1.5 bg-transparent
                       ${focused ? 'border-primary' : 'border-transparent'} hover:border-dark-border transition-colors`}>
        {value.map((v, i) => (
          <span key={i + v} className="group/chip flex items-center gap-1.5 bg-pa15 text-ink rounded-full pl-1 pr-2 py-0.5 text-xs max-w-full">
            <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold shrink-0">
              {initials(v)}
            </span>
            <span className="truncate">{displayName(v)}</span>
            <button onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-ink-mute hover:text-red-400 shrink-0"><X size={11} /></button>
          </span>
        ))}
        <input ref={inpRef} value={text} autoFocus={autoFocus}
          onChange={e => setText(e.target.value)} onKeyDown={onKey}
          onFocus={() => setFocused(true)} onBlur={onBlur}
          onPaste={e => {
            const t = e.clipboardData.getData('text')
            if (/[,;]/.test(t)) {
              e.preventDefault()
              const parts = t.split(/[,;]/).map(x => x.trim()).filter(Boolean)
              if (parts.length) { onChange([...value, ...parts.map(fmt)]); setText('') }
            }
          }}
          placeholder={value.length ? '' : placeholder}
          className={`flex-1 min-w-[120px] bg-transparent text-sm text-ink placeholder-ink-mute focus:outline-none py-1 ${required && !value.length ? '' : ''}`} />
        {loading && <Loader2 size={12} className="animate-spin text-ink-mute" />}
      </div>

      {focused && sug.length > 0 && (
        <div className="absolute left-12 right-0 top-full z-30 mt-0.5 bg-dark-surface border border-dark-border rounded-lg shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
          {sug.map((s, i) => (
            <button key={s.email} type="button"
              onMouseDown={e => { e.preventDefault(); addSug(s) }}
              onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm ${i === hi ? 'bg-dark-hover' : ''}`}>
              <span className="w-7 h-7 rounded-full bg-pa20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                {initials(`${s.name} <${s.email}>`)}
              </span>
              <span className="min-w-0">
                <span className="block text-ink truncate">{s.name || s.email}</span>
                {s.name && <span className="block text-[11px] text-ink-mute truncate">{s.email}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
