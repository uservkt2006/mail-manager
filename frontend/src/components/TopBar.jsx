import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell } from 'lucide-react'
import { api } from '../api'

export default function TopBar() {
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

  // click a mail in the dropdown → jump to it like Outlook: switch to Mail module,
  // open that mail in the reading pane, and focus the matching folder list
  const openMail = (m) => {
    window.dispatchEvent(new CustomEvent('mm-module', { detail: 'mail' }))
    window.dispatchEvent(new CustomEvent('mm-open-mail', { detail: m }))
    setOpen(false)
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
          placeholder="Tìm mail, người, việc, lịch… · from: · to: · cc: ( / )"
          className="w-full bg-dark-bg border border-dark-border rounded-md pl-9 pr-3 py-1.5 text-sm text-ink placeholder-gray-600 focus:outline-none focus:border-primary"
        />
        {open && results && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-50 max-h-[70vh] overflow-y-auto py-2">
            <div className="px-3 py-1 text-[11px] text-ink-dim border-b border-dark-border mb-1">
              {total} kết quả cho “{q}” · nhấn để mở
            </div>
            {total === 0 && <div className="px-3 py-4 text-sm text-ink-dim text-center">Không có kết quả. Thử từ khóa khác.</div>}
            {results.messages.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">Mail</div>
                {results.messages.slice(0, 5).map((m, i) => (
                  <div key={m.id} onClick={() => openMail(m)}
                    className="px-3 py-1.5 hover:bg-pa10 cursor-pointer group">
                    <div className="text-sm text-ink truncate">{m.subject || '(Không có chủ đề)'}</div>
                    <div className="text-xs text-ink-dim truncate">{(m.from || '').split('<')[0].trim() || m.from} · {m.folder_name || ''}</div>
                  </div>
                ))}
                {results.messages.length > 5 && (
                  <div className="px-3 py-1 text-[11px] text-primary hover:underline cursor-pointer"
                    onClick={() => { window.dispatchEvent(new CustomEvent('mm-search-full', { detail: q.trim() })); setOpen(false) }}>
                    Xem tất cả {results.messages.length} kết quả →
                  </div>
                )}
              </div>
            )}
            {results.contacts.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">People</div>
                {results.contacts.slice(0, 5).map(c => (
                  <div key={c.id} className="px-3 py-1.5 hover:bg-dark-hover cursor-default">
                    <div className="text-sm text-ink truncate">{c.name}</div>
                    <div className="text-xs text-ink-dim truncate">{c.email}</div>
                  </div>
                ))}
              </div>
            )}
            {results.tasks.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">To Do</div>
                {results.tasks.slice(0, 5).map(t => (
                  <div key={t.id} className="px-3 py-1.5 hover:bg-dark-hover cursor-default">
                    <div className="text-sm text-ink truncate">{t.title}</div>
                    <div className="text-xs text-ink-dim truncate">{t.status}</div>
                  </div>
                ))}
              </div>
            )}
            {results.events.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">Lịch</div>
                {results.events.slice(0, 5).map(e => (
                  <div key={e.id} className="px-3 py-1.5 hover:bg-dark-hover cursor-default">
                    <div className="text-sm text-ink truncate">{e.subject}</div>
                    <div className="text-xs text-ink-dim truncate">{e.start_at?.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button className="p-2 rounded hover:bg-dark-hover text-ink-dim" title="Thông báo (sắp có)"><Bell size={15} /></button>
    </div>
  )
}
