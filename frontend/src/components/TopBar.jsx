import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell } from 'lucide-react'
import { api } from '../api'

export default function TopBar({ onOpenResults }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault(); inputRef.current?.focus()
      }
    }
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [])

  const run = async () => {
    if (q.trim().length < 2) return
    const r = await api.search(q.trim())
    setResults(r)
    setOpen(true)
  }

  const total = results ? results.messages.length + results.contacts.length + results.tasks.length + results.events.length : 0

  return (
    <div className="h-11 flex-shrink-0 bg-dark-surface border-b border-dark-border flex items-center gap-3 px-3">
      <div ref={boxRef} className="relative flex-1 max-w-[560px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run(); if (e.key === 'Escape') setOpen(false) }}
          placeholder="Tìm kiếm mail, người, việc, lịch… ( / )"
          className="w-full bg-dark-bg border border-dark-border rounded-md pl-9 pr-3 py-1.5 text-sm text-ink placeholder-gray-600 focus:outline-none focus:border-primary"
        />
        {open && results && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-50 max-h-[70vh] overflow-y-auto py-2">
            <div className="px-3 py-1 text-[11px] text-ink-dim border-b border-dark-border mb-1">
              {total} kết quả cho “{q}” · chỉ dữ liệu của bạn
            </div>
            {total === 0 && <div className="px-3 py-4 text-sm text-ink-dim text-center">Không có kết quả. Thử từ khóa khác.</div>}
            {results.messages.length > 0 && <Section title="Mail" items={results.messages.map(m => ({ main: m.subject, sub: `${m.from} · ${m.folder_name || ''}` }))} />}
            {results.contacts.length > 0 && <Section title="People" items={results.contacts.map(c => ({ main: c.name, sub: c.email }))} />}
            {results.tasks.length > 0 && <Section title="To Do" items={results.tasks.map(t => ({ main: t.title, sub: t.status }))} />}
            {results.events.length > 0 && <Section title="Lịch" items={results.events.map(e => ({ main: e.subject, sub: e.start_at?.slice(0, 16).replace('T', ' ') }))} />}
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button className="p-2 rounded hover:bg-dark-hover text-ink-dim" title="Thông báo (sắp có)"><Bell size={15} /></button>
    </div>
  )
}

function Section({ title, items }) {
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">{title}</div>
      {items.slice(0, 5).map((it, i) => (
        <div key={i} className="px-3 py-1.5 hover:bg-dark-hover cursor-default">
          <div className="text-sm text-ink truncate">{it.main}</div>
          <div className="text-xs text-ink-dim truncate">{it.sub}</div>
        </div>
      ))}
    </div>
  )
}
