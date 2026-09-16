import React, { useState, useCallback, useEffect } from 'react'
import { Zap, Plus, Trash2, Play, ToggleLeft, ToggleRight, Pencil, X, Clock, Inbox as InboxIcon } from 'lucide-react'
import { api } from '../api'

/* Full rule manager (Outlook "Rules and Alerts"): list all rules, toggle, edit,
   delete, run now, reorder priority. Creating happens in RuleModal. */
const ACT_LABELS = (a, folders) => {
  const out = []
  if (a.a_folder_id) {
    const f = folders.find(x => String(x.id) === String(a.a_folder_id))
    out.push(`Chuyển vào ${f ? f.name : 'thư mục'}`)
  }
  if (a.a_mark_read) out.push('đánh dấu đã đọc')
  if (a.a_star) out.push('gắn sao')
  if (a.a_category) out.push(`phân loại ${a.a_category}`)
  if (a.a_flag_days) out.push(`cờ ${a.a_flag_days} ngày`)
  if (a.a_delete) out.push('xoá')
  if (a.a_forward) out.push(`chuyển tiếp → ${a.a_forward}`)
  if (a.a_autoreply) out.push('trả lời ngay')
  return out
}

const COND_LABELS = (c) => {
  const out = []
  if (c.c_from) out.push(`từ ${c.c_from}`)
  if (c.c_subject) out.push(`tiêu đề chứa "${c.c_subject}"`)
  if (c.c_body) out.push(`nội dung chứa "${c.c_body}"`)
  if (c.c_to) out.push(`đến ${c.c_to}`)
  if (c.c_cc) out.push(`cc ${c.c_cc}`)
  if (c.c_unread) out.push('chưa đọc')
  if (c.c_has_attachment) out.push('có tệp đính kèm')
  if (c.c_size_min) out.push(`> ${c.c_size_min} KB`)
  return out
}

export default function RulesView({ folders, onNew, onEdit }) {
  const [rules, setRules] = useState([])
  const [busy, setBusy] = useState(null)
  const flat = []
  ;(function walk(ns) { for (const n of ns || []) { flat.push(n); walk(n.children) } })(folders)

  const load = useCallback(() => {
    api.rules().then(d => setRules(d.rules || [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (r) => {
    setBusy(r.id)
    try {
      await api.patchRule(r.id, { enabled: !r.enabled })
      load()
    } finally { setBusy(null) }
  }
  const del = async (r) => {
    if (!confirm(`Xoá quy tắc "${r.name}"?`)) return
    setBusy(r.id)
    try { await api.deleteRule(r.id); load() } finally { setBusy(null) }
  }
  const runNow = async () => {
    setBusy('run')
    try {
      const r = await api.runRules()
      alert(`Đã chạy quy tắc — khớp ${r.messages_matched} thư`)
      load()
    } finally { setBusy(null) }
  }
  const bumpPriority = async (r, delta) => {
    await api.patchRule(r.id, { priority: Math.max(0, (r.priority || 0) + delta) })
    load()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-dark-bg">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-ink-strong flex items-center gap-2">
              <Zap size={17} className="text-amber-400" /> Quy tắc
            </h2>
            <p className="text-xs text-ink-mute mt-0.5">
              Chạy tự động khi thư mới về (delta sync) và khi bạn bấm "Chạy". Thứ tự ưu tiên: số càng cao chạy càng trước.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={runNow} disabled={busy === 'run'}
              className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
              <Play size={14} className={busy === 'run' ? 'animate-spin' : ''} /> Chạy ngay
            </button>
            <button onClick={onNew} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5">
              <Plus size={14} /> Quy tắc mới
            </button>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-ink-mute">
            <Zap size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Chưa có quy tắc nào. Tạo một quy tắc để tự động phân loại, đánh dấu hoặc xoá thư.</p>
            <button onClick={onNew} className="btn-primary text-sm mt-4 py-2 px-4">Tạo quy tắc đầu tiên</button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => {
              const conds = COND_LABELS(r)
              const acts = ACT_LABELS(r, flat)
              return (
                <div key={r.id} className={`bg-dark-surface border rounded-lg p-4 ${r.enabled ? 'border-dark-border' : 'border-dark-border opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggle(r)} disabled={busy === r.id}
                      className="shrink-0 mt-0.5"
                      title={r.enabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}>
                      {r.enabled
                        ? <ToggleRight size={22} className="text-primary" />
                        : <ToggleLeft size={22} className="text-ink-mute" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-strong truncate">{r.name}</span>
                        {(r.priority || 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-px rounded bg-pa15 text-primary shrink-0">ưu tiên {r.priority}</span>
                        )}
                        {(r.hits || 0) > 0 && (
                          <span className="text-[10px] text-ink-mute shrink-0 flex items-center gap-0.5">
                            <Clock size={10} /> đã khớp {r.hits}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-mute mt-1">
                        {conds.length ? <>NẾU {conds.join(' · ')}</> : <span className="text-ink-dim/60">(không điều kiện)</span>}
                      </div>
                      <div className="text-xs mt-1">
                        {acts.length ? <span className="text-primary/90">THÌ {acts.join(' · ')}</span>
                          : <span className="text-ink-dim/60">(chưa có hành động)</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => bumpPriority(r, 1)} title="Tăng ưu tiên"
                        className="p-1 rounded hover:bg-dark-hover text-ink-mute hover:text-primary">↑</button>
                      <button onClick={() => bumpPriority(r, -1)} title="Giảm ưu tiên"
                        className="p-1 rounded hover:bg-dark-hover text-ink-mute hover:text-primary">↓</button>
                      <button onClick={() => onEdit(r)} title="Sửa"
                        className="p-1.5 rounded hover:bg-dark-hover text-ink-mute hover:text-ink"><Pencil size={13} /></button>
                      <button onClick={() => del(r)} title="Xoá"
                        className="p-1.5 rounded hover:bg-dark-hover text-ink-mute hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
