import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Inbox, Send, FileText, Trash2, Archive, Folder as FolderIcon, Plus, X } from 'lucide-react'
import { api } from '../api'

const TYPE_ICON = { inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, archive: Archive }

function Node({ node, depth, activeId, onSelect, onDelete }) {
  const [open, setOpen] = useState(true)
  const hasKids = node.children && node.children.length > 0
  const Icon = TYPE_ICON[node.type] || FolderIcon
  const active = String(activeId) === String(node.id)
  return (
    <div>
      <div
        className={`folder-item group flex items-center gap-2 pr-2 rounded-md text-sm cursor-pointer ${active ? 'active' : 'text-ink-dim'}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => onSelect(node)}
      >
        {hasKids ? (
          <button onClick={e => { e.stopPropagation(); setOpen(!open) }} className="text-ink-mute hover:text-ink">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : <span className="w-3" />}
        <Icon size={14} className={active ? 'text-primary' : 'text-ink-dim'} />
        <span className="flex-1 truncate">{node.name}</span>
        {node.unread > 0 && <span className="badge-unread">{node.unread}</span>}
        {node.type === 'user' && (
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`Xóa thư mục "${node.name}"? Thư bên trong chuyển về hộp thư đến.`)) { onDelete(node) } }}
            className="opacity-0 group-hover:opacity-100 text-ink-mute hover:text-red-400"
          ><X size={12} /></button>
        )}
      </div>
      {open && hasKids && node.children.map(c => (
        <Node key={c.id} node={c} depth={depth + 1} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
      ))}
    </div>
  )
}

export default function FolderTree({ tree, activeFolderId, onSelect, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [inInbox, setInInbox] = useState(false)

  const submitAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await api.createFolder(name.trim(), inInbox ? 'inbox' : null)
    setName(''); setAdding(false); onChanged()
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-dark-border flex flex-col bg-dark-surface overflow-hidden">
      <div className="p-3 border-b border-dark-border">
        <button onClick={() => setAdding(true)} className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm">
          <Plus size={15} /> New Mail
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute flex items-center justify-between">
          Folders
          {adding ? (
            <button onClick={() => setAdding(false)} className="text-ink-dim hover:text-ink-strong"><X size={12} /></button>
          ) : (
            <button onClick={() => setAdding(true)} className="text-ink-mute hover:text-primary" title="Tạo thư mục"><Plus size={12} /></button>
          )}
        </div>
        {adding && (
          <form onSubmit={submitAdd} className="mx-3 mb-1.5 bg-dark-bg border border-pa40 rounded-md p-2">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Tên thư mục..."
              className="w-full bg-transparent text-sm text-ink-strong placeholder-gray-600 focus:outline-none mb-1" />
            <label className="flex items-center gap-1.5 text-[11px] text-ink-dim mb-1.5">
              <input type="checkbox" checked={inInbox} onChange={e => setInInbox(e.target.checked)} />
              Con của Hộp thư đến
            </label>
            <button type="submit" className="w-full text-xs btn-primary py-1">Tạo</button>
          </form>
        )}
        {tree.map(n => (
          <Node key={n.id} node={n} depth={0} activeId={activeFolderId}
            onSelect={onSelect}
            onDelete={async (node) => { await api.deleteFolder(node.id); onChanged() }} />
        ))}
      </div>
    </div>
  )
}
