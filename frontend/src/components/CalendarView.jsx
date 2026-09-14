import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock } from 'lucide-react'
import { api } from '../api'

const CAT_COLORS = { Work: '#4c8dff', Personal: '#22c55e', Finance: '#f59e0b', Urgent: '#ef4444', Travel: '#8b5cf6', Other: '#6b7280' }
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function sameDay(a, b) { return a.toDateString() === b.toDateString() }

export default function CalendarView() {
  const [events, setEvents] = useState([])
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(() => new Date())
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ subject: '', time: '09:00', dur: 60, location: '', category: 'Work' })

  const load = () => api.events().then(d => setEvents(d.events))
  useEffect(() => { load() }, [])

  const days = []
  const first = new Date(month)
  const startDow = (first.getDay() + 6) % 7
  for (let i = 0; i < startDow; i++) days.push(null)
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  for (let d = 1; d <= dim; d++) days.push(new Date(month.getFullYear(), month.getMonth(), d))

  const dayEvents = events.filter(e => sameDay(new Date(e.start_at), sel))

  const submit = async (e) => {
    e.preventDefault()
    const [h, m] = form.time.split(':').map(Number)
    const s = new Date(sel); s.setHours(h || 8, m || 0, 0, 0)
    await api.addEvent({
      subject: form.subject, start_at: s.toISOString(),
      end_at: new Date(s.getTime() + form.dur * 6e4).toISOString(),
      location: form.location, category: form.category
    })
    setAdding(false); setForm({ ...form, subject: '' }); load()
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-dark-bg">
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold text-white min-w-[180px]">
            Tháng {month.getMonth() + 1} / {month.getFullYear()}
          </h2>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-dark-hover text-gray-400"><ChevronLeft size={16} /></button>
          <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(d) }} className="text-xs btn-secondary py-1 px-2">Hôm nay</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-dark-hover text-gray-400"><ChevronRight size={16} /></button>
          <div className="flex-1" />
          <button onClick={() => setAdding(true)} className="btn-primary text-sm flex items-center gap-1.5 py-1.5"><Plus size={14} /> Sự kiện</button>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] text-gray-600 font-medium mb-1">
          {WD.map(w => <div key={w}>{w}</div>)}
        </div>
        <div className="flex-1 grid grid-cols-7 auto-rows-fr gap-px bg-dark-border border border-dark-border rounded-lg overflow-hidden min-h-[380px]">
          {days.map((d, i) => {
            if (!d) return <div key={'e' + i} className="bg-dark-bg" />
            const evs = events.filter(e => sameDay(new Date(e.start_at), d))
            const isToday = sameDay(d, new Date())
            const isSel = sameDay(d, sel)
            return (
              <div key={i} onClick={() => setSel(d)}
                className={`bg-dark-bg p-1.5 cursor-pointer flex flex-col gap-1 overflow-hidden transition-colors ${isSel ? 'bg-primary/10' : 'hover:bg-dark-hover'}`}>
                <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white font-semibold' : 'text-gray-400'}`}>{d.getDate()}</span>
                <div className="space-y-0.5 overflow-hidden">
                  {evs.slice(0, 2).map(e => (
                    <div key={e.id} className="text-[10px] truncate rounded px-1 py-0.5"
                      style={{ backgroundColor: (CAT_COLORS[e.category] || '#4c8dff') + '25', color: CAT_COLORS[e.category] || '#4c8dff' }}>
                      {new Date(e.start_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {e.subject}
                    </div>
                  ))}
                  {evs.length > 2 && <div className="text-[10px] text-gray-600 pl-1">+{evs.length - 2} nữa</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="w-72 flex-shrink-0 border-l border-dark-border bg-dark-surface p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-white mb-1">{sel.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' })}</h3>
        <p className="text-xs text-gray-600 mb-4">{dayEvents.length} sự kiện</p>
        {adding && (
          <form onSubmit={submit} className="space-y-2 mb-4 p-3 bg-dark-bg border border-primary/40 rounded-lg">
            <input autoFocus placeholder="Tiêu đề" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required
              className="w-full bg-transparent border border-dark-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-primary" />
            <div className="flex gap-2">
              <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                className="flex-1 bg-transparent border border-dark-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-primary" />
              <input type="number" min="15" step="15" value={form.dur} onChange={e => setForm({ ...form, dur: +e.target.value })} title="Phút"
                className="w-16 bg-transparent border border-dark-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-primary" />
            </div>
            <input placeholder="Địa điểm" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
              className="w-full bg-transparent border border-dark-border rounded px-2.5 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary" />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full bg-dark-bg border border-dark-border rounded px-2.5 py-1.5 text-sm text-white focus:outline-none">
              {Object.keys(CAT_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-xs flex-1 py-1.5">Hủy</button>
              <button type="submit" className="btn-primary text-xs flex-1 py-1.5">Tạo</button>
            </div>
          </form>
        )}
        <div className="space-y-2">
          {dayEvents.length === 0 && !adding && <p className="text-sm text-gray-600">Trống. Bấm “Sự kiện” để thêm.</p>}
          {dayEvents.map(e => (
            <div key={e.id} className="group bg-dark-bg border border-dark-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white font-medium truncate">{e.subject}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {new Date(e.start_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    {e.location && ` · ${e.location}`}
                  </div>
                  <span className="inline-block mt-1.5 text-[10px] px-1.5 py-px rounded"
                    style={{ backgroundColor: (CAT_COLORS[e.category] || '#4c8dff') + '25', color: CAT_COLORS[e.category] || '#4c8dff' }}>
                    {e.category}
                  </span>
                </div>
                <button onClick={async () => { await api.delEvent(e.id); load() }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
