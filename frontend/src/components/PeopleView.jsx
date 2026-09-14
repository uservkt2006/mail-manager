import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Mail, Star, Users } from 'lucide-react'
import { api } from '../api'

export default function PeopleView() {
  const [contacts, setContacts] = useState([])
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', job_title: '', company: '' })
  const [mailsWith, setMailsWith] = useState([])

  const load = () => api.contacts().then(d => setContacts(d.contacts))
  useEffect(() => { load() }, [])

  const open = async (c) => {
    setSel(c)
    if (c.email) {
      try {
        const r = await api.search(c.email.split('@')[0])
        setMailsWith(r.messages.filter(m => (m.from || '').includes(c.email) || (m.to || '').includes(c.email)).slice(0, 8))
      } catch { setMailsWith([]) }
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    await api.addContact(form)
    setForm({ name: '', email: '', phone: '', job_title: '', company: '' })
    setAdding(false); load()
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-dark-bg">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Users size={18} className="text-primary" /> Danh bạ</h2>
          <button onClick={() => setAdding(true)} className="btn-primary text-sm flex items-center gap-1.5 py-1.5"><Plus size={14} /> Thêm liên hệ</button>
        </div>
        {adding && (
          <form onSubmit={submit} className="grid grid-cols-2 gap-2 mb-5 p-4 bg-dark-surface border border-primary/40 rounded-lg">
            <input autoFocus placeholder="Tên" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
              className="bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            <input placeholder="Điện thoại" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            <input placeholder="Chức vụ · Công ty" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })}
              className="bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary" />
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary text-sm">Hủy</button>
              <button type="submit" className="btn-primary text-sm">Lưu</button>
            </div>
          </form>
        )}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {contacts.map(c => (
            <div key={c.id} onClick={() => open(c)}
              className={`bg-dark-surface border rounded-lg p-4 cursor-pointer transition-colors ${sel?.id === c.id ? 'border-primary/60' : 'border-dark-border hover:bg-dark-hover'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold shrink-0">
                  {c.name?.[0]?.toUpperCase() || '?'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                    {c.name} {!!c.favorite && <Star size={11} className="text-yellow-400 fill-current shrink-0" />}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{c.email || c.phone || '—'}</div>
                </div>
              </div>
              {(c.job_title || c.company) && <div className="text-[11px] text-gray-600 mt-2 truncate">{[c.job_title, c.company].filter(Boolean).join(' · ')}</div>}
            </div>
          ))}
          {contacts.length === 0 && !adding && <p className="text-sm text-gray-600 col-span-3">Chưa có liên hệ nào.</p>}
        </div>
      </div>

      <div className="w-80 flex-shrink-0 border-l border-dark-border bg-dark-surface p-5 overflow-y-auto">
        {!sel ? <p className="text-sm text-gray-600">Chọn một người để xem hồ sơ.</p> : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">{sel.name?.[0]?.toUpperCase()}</div>
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{sel.name}</div>
                <div className="text-xs text-gray-500">{[sel.job_title, sel.company].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm mb-4">
              {sel.email && <div className="flex items-center gap-2 text-gray-300"><Mail size={13} className="text-gray-600" /> {sel.email}</div>}
              {sel.phone && <div className="flex items-center gap-2 text-gray-300">📞 {sel.phone}</div>}
            </div>
            <button onClick={() => setAdding(true)} className="btn-secondary text-xs w-full py-1.5 mb-1">+ Liên hệ mới</button>
            <button onClick={async () => { if (confirm(`Xóa liên hệ "${sel.name}"?`)) { await api.delContact(sel.id); setSel(null); load() } }}
              className="text-xs text-red-400/80 hover:text-red-400 w-full py-1.5 flex items-center justify-center gap-1.5 mb-5">
              <Trash2 size={12} /> Xóa liên hệ
            </button>
            <h4 className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Trao đổi gần đây</h4>
            {mailsWith.length === 0 && <p className="text-xs text-gray-600">Chưa có mail chung.</p>}
            <div className="space-y-1.5">
              {mailsWith.map(m => (
                <div key={m.id} className="bg-dark-bg border border-dark-border rounded-md px-3 py-2">
                  <div className="text-xs text-gray-200 truncate">{m.subject}</div>
                  <div className="text-[10px] text-gray-600 truncate">{m.from} · {new Date(m.date).toLocaleDateString('vi-VN')}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
