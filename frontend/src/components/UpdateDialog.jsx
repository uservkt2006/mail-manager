import React from 'react'
import { CheckCircle, X, Download, AlertCircle } from 'lucide-react'

export default function UpdateDialog({ updateInfo, onInstall, onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div className="flex items-center gap-2 text-ink">
            <CheckCircle size={18} className="text-emerald-400" />
            <span className="font-semibold text-sm">Update Available</span>
          </div>
          <button onClick={onDismiss} className="text-ink-dim hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-primary text-xs font-bold">v{updateInfo.latest}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-ink text-sm font-medium">
                New version <span className="text-primary font-semibold">{updateInfo.latest}</span> is available
              </p>
              <p className="text-ink-dim text-xs mt-1">
                You're currently running <span className="text-ink font-medium">v{updateInfo.current}</span>
              </p>
              {updateInfo.release_notes && (
                <p className="text-ink-muted text-xs mt-2 leading-relaxed">
                  {updateInfo.release_notes.split('\n').filter(l => l.trim()).slice(0, 3).join(' · ')}
                </p>
              )}
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300/90 text-xs leading-relaxed">
              The app will restart after installing the update. Your account settings and cache will be preserved.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-dark-border bg-dark-surface/50">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-dim hover:text-ink hover:bg-dark-border transition-colors"
          >
            Remind me later
          </button>
          <a
            href={updateInfo.download_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault()
              onInstall(updateInfo.download_url)
            }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-medium transition-colors"
          >
            <Download size={12} />
            Download & Install
          </a>
        </div>
      </div>
    </div>
  )
}
