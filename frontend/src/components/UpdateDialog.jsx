import React, { useState } from 'react'
import { CheckCircle, X, Download, AlertCircle, Loader2 } from 'lucide-react'

export default function UpdateDialog({ updateInfo, onInstall, onDismiss }) {
  const [installing, setInstalling] = useState(false)
  const [installStatus, setInstallStatus] = useState(null) // { ok, error, debPath }

  const handleInstall = async () => {
    if (installing) return
    setInstalling(true)
    setInstallStatus(null)
    try {
      if (window.electron?.installUpdate) {
        // Electron desktop: download + pkexec dpkg -i auto
        const result = await window.electron.installUpdate({
          downloadUrl: updateInfo.download_url,
          version: updateInfo.latest
        })
        setInstallStatus(result)
        if (result.ok) {
          setTimeout(() => onInstall?.(updateInfo.download_url), 1500)
        }
      } else {
        // Browser fallback: open download URL in new tab
        onInstall?.(updateInfo.download_url)
      }
    } catch (e) {
      setInstallStatus({ ok: false, error: e.message })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div className="flex items-center gap-2 text-ink">
            <CheckCircle size={18} className="text-emerald-400" />
            <span className="font-semibold text-sm">Cập nhật có sẵn</span>
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
                Phiên bản <span className="text-primary font-semibold">{updateInfo.latest}</span> đã có
              </p>
              <p className="text-ink-dim text-xs mt-1">
                Bạn đang dùng <span className="text-ink font-medium">v{updateInfo.current}</span>
              </p>
              {updateInfo.release_notes && (
                <p className="text-ink-muted text-xs mt-2 leading-relaxed">
                  {updateInfo.release_notes.split('\n').filter(l => l.trim()).slice(0, 3).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {installStatus?.ok && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-emerald-300/90 text-xs leading-relaxed">
                Đã tải về {Math.round(installStatus.size / 1024 / 1024)}MB. Hệ thống sẽ hỏi mật khẩu để cài đặt — sau khi cài xong, đóng app và mở lại để dùng bản mới.
              </p>
            </div>
          )}
          {installStatus && !installStatus.ok && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300/90 text-xs leading-relaxed">
                Lỗi: {installStatus.error}
              </p>
            </div>
          )}
          {!installStatus && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-300/90 text-xs leading-relaxed">
                App sẽ tự động tải và mở cửa sổ xác nhận mật khẩu để cài đặt. Sau khi cài xong, đóng và mở lại app.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-dark-border bg-dark-surface/50">
          <button
            onClick={onDismiss}
            disabled={installing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-dim hover:text-ink hover:bg-dark-border transition-colors disabled:opacity-50"
          >
            Để sau
          </button>
          <button
            onClick={handleInstall}
            disabled={installing || installStatus?.ok}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {installing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {installing ? 'Đang tải…' : installStatus?.ok ? 'Đã tải xong' : 'Tải & cài đặt'}
          </button>
        </div>
      </div>
    </div>
  )
}
