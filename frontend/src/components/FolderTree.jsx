import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Inbox, Send, FileText, Trash2, Archive, Folder as FolderIcon, Plus, X, Search, PenLine, FolderPlus, MailOpen, Zap, MoreVertical } from 'lucide-react'
import { api } from '../api'
import ContextMenu from './ContextMenu'

const TYPE_ICON = { inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, archive: Archive }

function Node({ node, depth, activeId, onSelect, onContext, onDropMail, onReorder }) {
  const [open, setOpen] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [dropPos, setDropPos] = useState(null)   // 'above' | 'below' | null (insertion indicator)
  const hasKids = node.children && node.children.length > 0
  const Icon = TYPE_ICON[node.type] || FolderIcon
  const active = String(activeId) === String(node.id)

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/mm-folder-id', String(node.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    if (!e.dataTransfer?.types?.includes('text/mm-folder-id')) return
    e.preventDefault()
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    // Outlook: top 30% = insert before, bottom 30% = insert after, middle = nest
    const ratio = (e.clientY - r.top) / r.height
    setDropPos(ratio < 0.3 ? 'above' : ratio > 0.7 ? 'below' : 'inside')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const fid = e.dataTransfer.getData('text/mm-folder-id')
    const mid = e.dataTransfer.getData('text/mm-mail-id')
    setDragOver(false)
    if (fid && fid !== String(node.id)) {
      onReorder(fid, node, dropPos || 'inside')
    } else if (mid) {
      onDropMail(mid, node)
    }
  }

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragLeave={() => { setDragOver(false); setDropPos(null) }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => onSelect(node)}
        onContextMenu={e => { e.preventDefault(); onContext(node, e.clientX, e.clientY) }}
        style={{ paddingLeft: 12 + depth * 14 }}
        className={`folder-item group relative flex items-center gap-2 pr-2 rounded-md text-sm cursor-pointer
          ${active ? 'active' : 'text-ink-dim'}
          ${dragOver && (dropPos === 'inside' || !dropPos) ? 'ring-1 ring-primary bg-pa10' : ''}
          ${dropPos === 'above' ? 'drop-above' : ''} ${dropPos === 'below' ? 'drop-below' : ''}`}
      >
        {hasKids ? (
          <button onClick={e => { e.stopPropagation(); setOpen(!open) }} className="text-ink-mute hover:text-ink">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : <span className="w-3" />}
        <Icon size={14} className={active ? 'text-primary' : 'text-ink-dim'} />
        <span className="flex-1 truncate">{node.name}</span>
        {node.unread > 0 && <span className="badge-unread">{node.unread}</span>}
      </div>
      {open && hasKids && node.children.map(c => (
        <Node key={c.id} node={c} depth={depth + 1} activeId={activeId}
          onSelect={onSelect} onContext={onContext} onDropMail={onDropMail} onReorder={onReorder} />
      ))}
    </div>
  )
}

export default function FolderTree({ tree, activeFolderId, onSelect, onChanged, onCompose,
                                      searchFolders = [], onOpenSearchFolder, onDeleteSearchFolder, onNewSearchFolder }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [inInbox, setInInbox] = useState(false)
  const [ctx, setCtx] = useState(null)   // {node, x, y}
  const [parentForNew, setParentForNew] = useState(null)

  // Reorder: flat list in the visual order after the drop, sent to the backend.
  const reorderTo = async (dragId, target, pos) => {
    const flat = []
    const walk = (nodes, pid) => nodes.forEach(n => {
      flat.push({ id: String(n.id), parent_id: pid })
      if (n.children) walk(n.children, String(n.id))
    })
    walk(tree, null)
    const dragIdx = flat.findIndex(f => f.id === dragId)
    if (dragIdx < 0) return
    const [moved] = flat.splice(dragIdx, 1)
    let ti = flat.findIndex(f => f.id === String(target.id))
    if (ti < 0) { ti = flat.length - 1 }
    if (pos === 'above') flat.splice(ti, 0, moved)
    else if (pos === 'below') flat.splice(ti + 1, 0, moved)
    else { // nest: parent under target
      moved.parent_id = String(target.id)
      flat.splice(ti + 1, 0, moved)
    }
    try {
      await api.reorderFolders(flat)
      onChanged()
    } catch (e) {
      console.warn('reorder failed', e)
      onChanged()  // revert visually by reloading
    }
  }

  const submitAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await api.createFolder(name.trim(), inInbox ? 'inbox' : null)
    setName(''); setAdding(false); onChanged()
  }

  const items = (node) => {
    const isUser = node.type === 'user'
    const out = []
    out.push({ label: 'Mở', icon: FolderIcon, onClick: () => onSelect(node) })
    out.push({ label: 'Tạo thư mục con…', icon: FolderPlus, onClick: () => { setParentForNew(node); setAdding(true) } })
    if (isUser) {
      out.push({ sep: true })
      out.push({ label: 'Đánh dấu tất cả đã đọc', icon: MailOpen, onClick: async () => {
        const r = await api.markFolderRead(node.id)
        onChanged?.()
        window.dispatchEvent(new Event('mm-synced'))
      } })
      out.push({ label: 'Chuyển thư mục này vào… (quy tắc)', icon: Zap, onClick: () => window.dispatchEvent(new CustomEvent('mm-rule-for-folder', { detail: node })) })
      out.push({ label: 'Đổi tên…', icon: PenLine, onClick: () => rename(node) })
      out.push({ label: 'Xóa tất cả thư trong này', icon: Trash2, danger: true,
        onClick: async () => {
          if (!confirm(`Xóa TOÀN BỘ thư trong "${node.name}" (cả trên Exchange)?`)) return
          await api.emptyFolder(node.id)
          onChanged?.()
        } })
      out.push({ label: 'Xóa thư mục', icon: X, danger: true,
        onClick: async () => {
          if (confirm(`Xóa "${node.name}"? Thư bên trong chuyển về hộp thư cha. Thư trên Exchange cũng bị xóa.`)) {
            await api.deleteFolder(node.id); onChanged()
          }
        } })
    }
    return out
  }

  const rename = async (node) => {
    const nn = prompt('Tên mới cho thư mục:', node.name)
    if (!nn || nn.trim() === node.name) return
    try {
      const r = await api.renameFolder(node.id, nn.trim())
      onChanged()
      if (!r.server) console.info('Đã đổi tên local (Exchange không tìm thấy folder gốc để đổi theo)')
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="w-full h-full border-r border-dark-border flex flex-col bg-dark-surface overflow-hidden">
      <div className="p-3 border-b border-dark-border">
        <button onClick={onCompose} className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm">
          <Plus size={15} /> New Mail
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute flex items-center justify-between">
          Folders
          {adding ? (
            <button onClick={() => { setAdding(false); setParentForNew(null) }} className="text-ink-dim hover:text-ink-strong"><X size={12} /></button>
          ) : (
            <button onClick={() => setAdding(true)} className="text-ink-mute hover:text-primary" title="Tạo thư mục"><Plus size={12} /></button>
          )}
        </div>
        {adding && (
          <form onSubmit={async (e) => {
              e.preventDefault()
              if (!name.trim()) return
              if (parentForNew) await api.createSubfolder(parentForNew.id, name.trim())
              else await api.createFolder(name.trim(), inInbox ? 'inbox' : null)
              setName(''); setAdding(false); setParentForNew(null); onChanged()
            }} className="mx-3 mb-1.5 bg-dark-bg border border-pa40 rounded-md p-2">
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder={parentForNew ? `Thư mục con của "${parentForNew.name}"…` : 'Tên thư mục...'}
              className="w-full bg-transparent text-sm text-ink-strong placeholder-gray-600 focus:outline-none mb-1" />
            {!parentForNew && (
              <label className="flex items-center gap-1.5 text-[11px] text-ink-dim mb-1.5">
                <input type="checkbox" checked={inInbox} onChange={e => setInInbox(e.target.checked)} />
                Con của Hộp thư đến
              </label>
            )}
            <button type="submit" className="w-full text-xs btn-primary py-1">Tạo</button>
          </form>
        )}
        {tree.map(n => (
          <Node key={n.id} node={n} depth={0} activeId={activeFolderId}
            onSelect={onSelect} onContext={(node, x, y) => setCtx({ node, x, y })}
            onDropMail={async (mailId, node) => { await api.move(mailId, node.id); onChanged() }}
            onReorder={reorderTo} />
        ))}
        <div className="px-3 py-1.5 mt-1 text-[11px] text-ink-dim/70">Kéo thư mục để sắp xếp lại thứ tự</div>

        <div className="px-3 py-1.5 mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-mute flex items-center justify-between border-t border-dark-border">
          Search Folders
          <button onClick={() => onNewSearchFolder && onNewSearchFolder()} className="text-ink-mute hover:text-primary" title="Tạo thư mục tìm kiếm"><Plus size={12} /></button>
        </div>
        {searchFolders.map(s => (
          <div key={s.id}
            className={`folder-item group flex items-center gap-2 pr-2 rounded-md text-sm cursor-pointer ${String(activeFolderId) === s.id ? 'active' : 'text-ink-dim'}`}
            style={{ paddingLeft: 12 }}
            onClick={() => onOpenSearchFolder && onOpenSearchFolder(s)}>
            <Search size={13} className="text-violet-400" />
            <span className="flex-1 truncate">{s.name}</span>
            <button
              onClick={e => { e.stopPropagation(); if (confirm(`Xóa "${s.name}"?`)) onDeleteSearchFolder(s.id) }}
              className="opacity-0 group-hover:opacity-100 text-ink-mute hover:text-red-400"><X size={12} /></button>
          </div>
        ))}
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={items(ctx.node)} onClose={() => setCtx(null)} />}
    </div>
  )
}
