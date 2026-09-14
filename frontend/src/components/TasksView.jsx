import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Flag, Link2, Check, Circle, Loader2 } from 'lucide-react'
import { api } from '../api'

const STATUS = { not_started: { icon: Circle, label: 'Chưa làm', cls: 'text-ink-dim' },
                 in_progress: { icon: Loader2, label: 'Đang làm', cls: 'text-primary' },
                 completed: { icon: Check, label: 'Xong', cls: 'text-green-500' } }
const NEXT = { not_started: 'in_progress', in_progress: 'completed', completed: 'not_started' }

export default function TasksView() {
  const [tasks, setTasks] = useState([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [filter, setFilter] = useState('all')

  const load = () => api.tasks().then(d => setTasks(d.tasks))
  useEffect(() => { load() }, [])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const shown = tasks.filter(t => {
    if (filter === 'today') return t.due_at && new Date(t.due_at) <= today
    if (filter === 'open') return t.status !== 'completed'
    return true
  })

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    await api.addTask({ title: title.trim(), due_at: new Date(Date.now() + 3 * 864e5).toISOString() })
    setTitle(''); setAdding(false); load()
  }

  const overdue = (t) => t.due_at && t.status !== 'completed' && new Date(t.due_at) < new Date()

  return (
    <div className="flex-1 bg-dark-bg overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-strong">To Do</h2>
          <button onClick={() => setAdding(true)} className="btn-primary text-sm flex items-center gap-1.5 py-1.5"><Plus size={14} /> Công việc</button>
        </div>
        <p className="text-xs text-ink-mute mb-4">
          {tasks.filter(t => t.status !== 'completed').length} đang mở ·
          {tasks.filter(t => overdue(t)).length} quá hạn · bấm trạng thái để đổi
        </p>

        <div className="flex gap-1.5 mb-4">
          {[['all', 'Tất cả'], ['open', 'Đang mở'], ['today', 'Hôm nay / quá hạn']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`px-3 py-1 rounded-md text-xs ${filter === id ? 'bg-primary text-ink-strong' : 'bg-dark-surface text-ink-dim hover:bg-dark-hover border border-dark-border'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {adding && (
          <form onSubmit={submit} className="flex gap-2 mb-3">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên công việc…"
              className="flex-1 bg-dark-surface border border-pa50 rounded-md px-3 py-2 text-sm text-ink-strong placeholder-gray-600 focus:outline-none" />
            <button type="submit" className="btn-primary text-sm">Thêm</button>
          </form>
        )}

        <div className="space-y-2">
          {shown.map(t => {
            const S = STATUS[t.status] || STATUS.not_started
            return (
              <div key={t.id} className={`group bg-dark-surface border border-dark-border rounded-lg px-4 py-3 flex items-center gap-3 ${t.status === 'completed' ? 'opacity-60' : ''}`}>
                <button onClick={async () => { await api.patchTask(t.id, { status: NEXT[t.status] }); load() }}
                  className={`p-1 rounded hover:bg-dark-hover ${S.cls}`} title={S.label}>
                  <S.icon size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${t.status === 'completed' ? 'text-ink-dim line-through' : 'text-ink'}`}>{t.title}</div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-mute mt-0.5">
                    {t.due_at && (
                      <span className={`flex items-center gap-1 ${overdue(t) ? 'text-red-400' : ''}`}>
                        <Flag size={10} /> {new Date(t.due_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} {S.label}
                      </span>
                    )}
                    {t.source_subject && <span className="flex items-center gap-1"><Link2 size={10} /> từ mail: {t.source_subject}</span>}
                  </div>
                </div>
                <button onClick={async () => { await api.delTask(t.id); load() }}
                  className="opacity-0 group-hover:opacity-100 text-ink-mute hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            )
          })}
          {shown.length === 0 && <p className="text-sm text-ink-mute text-center py-8">Không có công việc nào ở đây 🎉</p>}
        </div>
      </div>
    </div>
  )
}
