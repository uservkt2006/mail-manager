import React from 'react'
import { Mail, CalendarDays, Users, CheckSquare, Settings, Zap } from 'lucide-react'

const MODULES = [
  { id: 'mail', label: 'Mail', icon: Mail },
  { id: 'calendar', label: 'Lịch', icon: CalendarDays },
  { id: 'people', label: 'People', icon: Users },
  { id: 'tasks', label: 'To Do', icon: CheckSquare },
  { id: 'rules', label: 'Quy tắc', icon: Zap },
]

export default function AppRail({ module, onModule, user, onSettings }) {
  const initials = (user.display_name || user.email).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-14 flex-shrink-0 bg-dark-surface border-r border-dark-border flex flex-col items-center py-3">
      {MODULES.map(m => (
        <button
          key={m.id}
          onClick={() => onModule(m.id)}
          className={`relative w-11 h-11 mb-1 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
            module === m.id ? 'bg-pa15 text-primary' : 'text-ink-dim hover:bg-dark-hover'}`}
          title={m.label}
        >
          <m.icon size={17} />
          <span className="text-[8px] font-medium leading-none">{m.label}</span>
          {module === m.id && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded bg-primary" />}
        </button>
      ))}
      <div className="flex-1" />
      <button onClick={onSettings} className="w-11 h-11 rounded-lg flex items-center justify-center text-ink-dim hover:bg-dark-hover" title="Cài đặt">
        <Settings size={17} />
      </button>
      <div className="mt-2 w-9 h-9 rounded-full bg-pa25 text-primary flex items-center justify-center text-xs font-semibold" title={user.email}>
        {initials}
      </div>
    </div>
  )
}
