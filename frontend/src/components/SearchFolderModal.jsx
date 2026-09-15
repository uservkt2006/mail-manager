import React, { useState } from 'react'
import { X, Search } from 'lucide-react'
import { api } from '../api'

/* Outlook-style "New Search Folder": pick a base + conditions, saved as virtual folder. */
const PRESETS = [
  { key: 'unread', label: 'Thư chưa đọc — mọi thư mục', q: { unread: true } },
  { key: 'attach', label: 'Thư có tệp đính kèm', q: { has_attachment: true } },
  { key: 'starred', label: 'Thư được đánh dấu sao', q: { starred: true } },
  { key: 'flagged', label: 'Thư có cờ theo dõi', q: { flagged: true } },
]

export default function SearchFolderModal({ folders, onClose, onCreated }) {
  const flat = []
  ;(function walk(ns) { for (const n of ns || []) { flat.push(n); walk(n.children) } })(folders)
  const [name, setName] = useState('Chưa đọc — tất cả thư mục')
  const [q, setQ] = useState({ folder: null, unread: true, starred: false, flagged: false, has_attachment: false, category: '', search: '' })

  const pick = (p) => {
    setName(p.label)
    setQ({ folder: null, unread: false, starred: false, flagged: false, has_attachment: false, category: '', search: '', ...p.q })
  }
  const toggle = (k) => setQ(x => ({ ...x, [k]: !x[k] }))

  const save = async () => {
    if (!name.trim()) return
    await api.createSearchFolder({ name: name.trim(), ...q })
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-[440px] max-w-[94vw] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-ink-strong flex items-center gap-2"><Search size={14} className="text-violet-400" /> Search Folder mới</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={15} /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-1.5">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => pick(p)}
                className={`text-left px-3 py-2 rounded-lg border text-[13px] ${JSON.stringify(q) === JSON.stringify({ folder: null, unread: false, starred: false, flagged: false, has_attachment: false, category: '', search: '', ...p.q }) ? 'border-violet-500/70 bg-violet-500/10 text-ink-strong' : 'border-dark-border text-ink-dim hover:bg-dark-hover'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t border-dark-border pt-3 space-y-2">
            <label className="block text-[11px] uppercase tracking-wide text-ink-mute font-semibold">Điều kiện tùy chỉnh</label>
            <select value={q.folder || ''} onChange={e => setQ({ ...q, folder: e.target.value || null })}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-2 py-1.5 text-[13px] text-ink">
              <option value="">Mọi thư mục</option>
              {flat.map(f => <option key={f.id} value={f.id}>{'　'.repeat(0) + f.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-dim">
              {[['unread', 'Chưa đọc'], ['starred', 'Đánh dấu sao'], ['flagged', 'Có cờ'], ['has_attachment', 'Có đính kèm']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={q[k]} onChange={() => toggle(k)} />{l}
                </label>
              ))}
            </div>
            <input value={q.search} onChange={e => setQ({ ...q, search: e.target.value })} placeholder="Từ khóa (tiêu đề, người gửi, nội dung)…"
              className="w-full bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 text-[13px] text-ink placeholder-ink-mute focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1">Tên Search Folder</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:border-primary" />
          </div>
          <button onClick={save} disabled={!name.trim()} className="btn-primary w-full py-2 text-sm disabled:opacity-50">Tạo</button>
        </div>
      </div>
    </div>
  )
}
