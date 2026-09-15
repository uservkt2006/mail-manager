import React, { useState, useEffect } from 'react'
import { Check, RefreshCw, Cloud, CloudOff, CloudCog, Radio } from 'lucide-react'
import { api } from '../api'

export default function StatusBar({ itemInfo, online, onRefresh, hasAccount, realtime }) {
  const [syncAt, setSyncAt] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState(null)

  // flash incoming realtime events briefly
  useEffect(() => {
    if (!realtime) return
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
    </div>
  )
}
