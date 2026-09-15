import React from 'react'
import { X, ArrowLeft } from 'lucide-react'
import EmailDetail from './EmailDetail'

export default function ReadingModal({ email, folders, onClose, ...handlers }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
      <div className="bg-dark-bg border border-dark-border rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border shrink-0">
          <button onClick={onClose} className="text-xs flex items-center gap-1.5 text-ink-dim hover:text-ink">
            <ArrowLeft size={13} /> Quay lại danh sách (Esc)
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={15} /></button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <EmailDetail email={email} folders={folders} {...handlers} />
        </div>
      </div>
    </div>
  )
}
