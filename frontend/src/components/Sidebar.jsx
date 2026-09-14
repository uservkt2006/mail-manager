import React from 'react'
import { Plus, Settings, Archive, Star, Send, Trash2, Inbox, ChevronDown } from 'lucide-react'

export default function Sidebar({ folders, activeFolder, onFolderClick, onCompose, onSettings, stats }) {
  return (
    <div className="w-64 flex-shrink-0 bg-dark-surface border-r border-dark-border flex flex-col">
      {/* Logo / Header */}
      <div className="p-4 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
            <Inbox size={16} className="text-ink-strong" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-ink-strong tracking-tight">Mail Manager</h1>
            <p className="text-xs text-ink-dim">v2.0 · FPT Exchange</p>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="px-4 py-3 border-b border-dark-border">
        <div className="flex gap-4 text-xs text-ink-dim">
          <div>
            <span className="text-ink-strong font-semibold">{stats.unread || 0}</span> chưa đọc
          </div>
          <div>
            <span className="text-ink-strong font-semibold">{stats.starred || 0}</span> yêu thích
          </div>
        </div>
      </div>

      {/* Compose Button */}
      <div className="p-4">
        <button
          onClick={onCompose}
          className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
        >
          <Plus size={18} />
          <span>Viết thư</span>
          <span className="text-xs opacity-75 ml-auto">Ctrl+N</span>
        </button>
      </div>

      {/* Folders */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-xs font-medium text-ink-dim uppercase tracking-wider px-3 py-2">
          Thư mục
        </div>
        <div className="space-y-0.5">
          {folders.map(folder => {
            const folderStats = stats[folder.id + '_total'] || 0
            return (
              <button
                key={folder.id}
                onClick={() => onFolderClick(folder.id)}
                className={`folder-item w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                  activeFolder === folder.id ? 'active' : 'text-ink-dim'
                }`}
              >
                <folder.icon size={16} className={activeFolder === folder.id ? 'text-primary' : 'text-ink-dim'} />
                <span className="flex-1 text-left">{folder.name}</span>
                <span className="text-xs text-ink-mute">{folder.unread > 0 ? folder.unread : ''}</span>
              </button>
            )
          })}
        </div>

        {/* Categories */}
        <div className="mt-6">
          <div className="text-xs font-medium text-ink-dim uppercase tracking-wider px-3 py-2">
            Nhãn
          </div>
          <div className="space-y-0.5">
            {[
              { name: 'Công việc', color: '#4c8dff' },
              { name: 'Cá nhân', color: '#22c55e' },
              { name: 'Tài chính', color: '#f59e0b' },
              { name: 'Khẩn', color: '#ef4444' }
            ].map(cat => (
              <button key={cat.name} className="folder-item w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ink-dim hover:bg-dark-hover">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }}></span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Starred */}
        <div className="mt-6">
          <button className="folder-item w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ink-dim hover:bg-dark-hover">
            <Star size={16} className="text-yellow-500" />
            <span>Yêu thích</span>
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="p-4 border-t border-dark-border">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ink-dim hover:bg-dark-hover"
        >
          <Settings size={16} />
          <span>Cài đặt</span>
        </button>
      </div>
    </div>
  )
}
