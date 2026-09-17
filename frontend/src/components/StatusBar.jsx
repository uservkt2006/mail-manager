import React, { useState, useEffect } from 'react'
import { Check, RefreshCw, Cloud, CloudOff, CloudCog, Radio } from 'lucide-react'
import { api } from '../api'

export default function StatusBar({ itemInfo, online, onRefresh, hasAccount, realtime, updateInfo, onInstallUpdate }) {
  const [syncAt, setSyncAt] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState(null)

  // flash incoming realtime events briefly; folder-empty jobs get a live progress line
  const [emptyJob, setEmptyJob] = useState(null)
  useEffect(() => {
    if (!realtime) return
    if (realtime.type === 'empty_progress') {
      setEmptyJob(realtime)
      if (realtime.state === 'done') setTimeout(() => setEmptyJob(null), 6000)
      return
    }
    setEmptyJob(null)
    setNote(realtime.type === 'new_mail' ? `📩 Thư mới: ${(realtime.subject || '').slice(0, 60)}` : 'Hộp thư vừa cập nhật')
    const t = setTimeout(() => setNote(null), 8000)
    return () => clearTimeout(t)
  }, [realtime])

  const refresh = () => {
    setSpinning(true)
    onRefresh?.()
    setTimeout(() => { setSpinning(false); setSyncAt(new Date()) }, 400)
  }

  const doSync = async () => {
    setSyncing(true); setNote(null)
    try {
      const r = await api.syncNow()
      const e = r.total || {}
      setNote(`+${e.messages || 0} mail · +${e.events || 0} lịch · +${e.contacts || 0} liên hệ`)
      onRefresh?.()
      setSyncAt(new Date())
      setTimeout(() => setNote(null), 6000)
    } catch (err) {
      setNote('Sync lỗi: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="h-7 flex-shrink-0 bg-dark-surface border-t border-dark-border flex items-center px-3 gap-4 text-[11px] text-ink-dim select-none">
      <span>{itemInfo}</span>
      <div className="flex-1" />
      {emptyJob && (
        <span className="flex items-center gap-2 text-amber-400" title="Đang xóa toàn bộ thư trên server Exchange">
          <RefreshCw size={10} className={emptyJob.state === 'done' ? '' : 'animate-spin'} />
          {emptyJob.state === 'done'
            ? <>Xóa hoàn tất: “{emptyJob.folder}” · {emptyJob.server} thư trên server</>
            : <>Đang xóa “{emptyJob.folder}”… {Math.min(emptyJob.done, emptyJob.total)}/{emptyJob.total}</>}
          {emptyJob.total > 0 && emptyJob.state !== 'done' && (
            <span className="inline-block w-24 h-1 bg-dark-border rounded overflow-hidden">
              <span className="block h-full bg-amber-400 transition-all" style={{ width: `${Math.round(100 * Math.min(emptyJob.done, emptyJob.total) / Math.max(1, emptyJob.total))}%` }} />
            </span>
          )}
        </span>
      )}
      {note && <span className="text-primary">{note}</span>}
      {hasAccount && (
        <span className="flex items-center gap-1 text-emerald-500/80" title="Delta sync: mail mới tự xuất hiện sau vài giây">
          <Radio size={10} className="animate-pulse" /> Trực tiếp
        </span>
      )}
      {hasAccount && (
        <button onClick={doSync} disabled={syncing} className="flex items-center gap-1.5 hover:text-ink disabled:opacity-60" title="Đồng bộ ngay với Exchange">
          <CloudCog size={11} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
        </button>
      )}
      <button onClick={refresh} className="flex items-center gap-1.5 hover:text-ink">
        <RefreshCw size={11} className={spinning ? 'animate-spin' : ''} /> Làm mới
      </button>
      <span className="flex items-center gap-1.5">
        {online ? <Cloud size={11} className="text-green-500" /> : <CloudOff size={11} className="text-red-400" />}
        {online ? 'Đã kết nối Exchange' : 'Mất kết nối'}
      </span>
      <span className="flex items-center gap-1">
        <Check size={11} className="text-primary" />
        {syncAt ? `Đồng bộ ${syncAt.toLocaleTimeString('vi-VN')}` : 'Đồng bộ lúc mở app'}
      </span>
      {updateInfo?.has_update && (
        <button onClick={onInstallUpdate} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded text-xs font-medium animate-pulse">
          🔄 Có bản mới {updateInfo.latest}
        </button>
      )}
    </div>
  )
}
