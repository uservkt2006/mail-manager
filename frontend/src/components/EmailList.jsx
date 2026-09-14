import React, { useState, useEffect } from 'react'
import { Archive, Trash2, Star, MessageSquare, RefreshCw, Search, Flag, Paperclip } from 'lucide-react'
import { api } from '../api'

const FOLDER_LABEL = { inbox: 'Hộp thư đến', sent: 'Đã gửi', drafts: 'Bản nháp', trash: 'Thùng rác', archive: 'Lưu trữ' }

export default function EmailList({
  emails, activeFolder, selectedEmailId, onEmailSelect, onArchive, onDelete, onStar,
  onRefresh, conversationView, onToggleConversation, searchTerm, onSearchChange,
  selectedCategory, onCategoryChange, loading
}) {
  const [catMeta, setCatMeta] = useState({ categories: [], colors: {} })
  useEffect(() => { api.categories().then(setCatMeta).catch(() => {}) }, [])

  const items = emails.map(it => conversationView ? it.email : it)
  const extra = conversationView ? emails.map(it => it.reply_count) : []

  return (
    <div className="w-[340px] flex-shrink-0 bg-dark-surface border-r border-dark-border flex flex-col overflow-hidden">
      <div className="p-3 border-b border-dark-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-white text-sm">{activeFolder ? (FOLDER_LABEL[activeFolder.type] || activeFolder.name) : '…'}</h2>
          <div className="flex gap-0.5">
            <button onClick={onToggleConversation} title="Chế độ hội thoại"
              className={`p-1.5 rounded hover:bg-dark-hover ${conversationView ? 'text-primary' : 'text-gray-500'}`}>
              <MessageSquare size={14} />
            </button>
            <button onClick={onRefresh} className="p-1.5 rounded hover:bg-dark-hover text-gray-500"><RefreshCw size={14} /></button>
          </div>
        </div>
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input value={searchTerm} onChange={e => onSearchChange(e.target.value)} placeholder="Lọc trong thư mục này…"
            className="w-full bg-dark-bg border border-dark-border rounded-md pl-8 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => onCategoryChange('')}
            className={`px-2 py-0.5 rounded text-[11px] ${selectedCategory === '' ? 'bg-primary text-white' : 'bg-dark-bg text-gray-500 hover:bg-dark-hover'}`}>
            Tất cả
          </button>
          {catMeta.categories.map(c => (
            <button key={c} onClick={() => onCategoryChange(c === selectedCategory ? '' : c)}
              className="px-2 py-0.5 rounded text-[11px] flex items-center gap-1"
              style={{ backgroundColor: c === selectedCategory ? catMeta.colors[c] : 'transparent', color: c === selectedCategory ? 'white' : (catMeta.colors[c] || '#6b7280') }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catMeta.colors[c] || '#4c8dff' }} />
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-600"><RefreshCw size={20} className="animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600">
            <Archive size={36} className="mb-2 opacity-30" />
            <p className="text-sm">Thư mục trống</p>
          </div>
        ) : items.map((email, idx) => {
          const unread = !email.is_read
          const replies = extra[idx] || 0
          const cats = Array.isArray(email.categories) ? email.categories : []
          return (
            <div key={email.id} onClick={() => onEmailSelect(email)}
              className={`email-item group px-3.5 py-2.5 border-b border-dark-border cursor-pointer ${selectedEmailId === email.id ? 'active' : ''}`}>
              <div className="flex items-start justify-between mb-0.5 gap-2">
                <span className={`text-[13px] truncate flex-1 ${unread ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 align-middle" />}
                  {(email.from || '').split('<')[0].trim() || email.from}
                </span>
                <span className="text-[11px] text-gray-600 shrink-0 flex items-center gap-1">
                  {email.flag_due && <Flag size={10} className="text-primary" />}
                  {new Date(email.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}{' '}
                  {new Date(email.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={`text-[13px] truncate ${unread ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>{email.subject}</div>
              <div className="text-xs text-gray-600 truncate mt-0.5">{email.preview}
                {replies > 0 && <span className="ml-1.5 text-gray-500">· {replies + 1} thư</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {cats.slice(0, 2).map(c => (
                  <span key={c} className="text-[10px] px-1.5 py-px rounded"
                    style={{ backgroundColor: (catMeta.colors[c] || '#4c8dff') + '22', color: catMeta.colors[c] || '#4c8dff' }}>{c}</span>
                ))}
                {email.starred && <Star size={11} className="text-yellow-400 fill-current" />}
                <div className="flex-1" />
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); onStar(email.id) }} title="Yêu thích"><Star size={12} className={email.starred ? 'text-yellow-400 fill-current' : 'text-gray-600 hover:text-yellow-400'} /></button>
                  <button onClick={e => { e.stopPropagation(); onArchive(email.id) }} title="Lưu trữ (A)"><Archive size={12} className="text-gray-600 hover:text-primary" /></button>
                  <button onClick={e => { e.stopPropagation(); onDelete(email.id) }} title="Xóa (D)"><Trash2 size={12} className="text-gray-600 hover:text-red-400" /></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
