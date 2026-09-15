import React, { useState } from 'react'
import { X, Zap } from 'lucide-react'
import { api } from '../api'

/* Outlook-style rule builder: IF <conditions> THEN <actions>. All conditions AND. */
export default function RuleModal({ folders, categories, initial, targetFolder, onClose, onCreated }) {
  const flat = []
  ;(function walk(ns) { for (const n of ns || []) { flat.push(n); walk(n.children) } })(folders)
  const [name, setName] = useState(
    targetFolder ? `Quy tắc → ${targetFolder.name}` : initial ? `Quy tắc: ${(initial.from || '').split('<')[0].trim()}` : '')
  const [c, setC] = useState(initial
    ? { c_from: (initial.from || '').split('<')[0].trim(), c_subject: '', c_body: '', c_to: '', c_unread: false, c_has_attachment: false }
    : { c_from: '', c_subject: '', c_body: '', c_to: '', c_unread: false, c_has_attachment: false })
  const [a, setA] = useState({ a_folder_id: targetFolder ? String(targetFolder.id) : '', a_mark_read: false, a_star: false, a_category: '', a_flag_days: '' })

  const save = async () => {
    if (!name.trim()) return
    await api.createRule({
      name: name.trim(),
      c_from: c.c_from.trim() || null,
      c_subject: c.c_subject.trim() || null,
      c_body: c.c_body.trim() || null,
      c_to: c.c_to.trim() || null,
      c_unread: c.c_unread || null,
      c_has_attachment: c.c_has_attachment || null,
      a_folder_id: a.a_folder_id ? Number(a.a_folder_id) : null,
      a_mark_read: a.a_mark_read,
      a_star: a.a_star,
      a_category: a.a_category || null,
      a_flag_days: a.a_flag_days ? Number(a.a_flag_days) : null,
    })
    onCreated()
    onClose()
  }

  const inp = "w-full bg-dark-bg border border-dark-border rounded-md px-2.5 py-1.5 text-[13px] text-ink placeholder-ink-mute focus:outline-none focus:border-primary"
  const chk = (label, val, set) => (
    <label className="flex items-center gap-1.5 text-[13px] text-ink-dim cursor-pointer">
      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />{label}
    </label>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-[480px] max-w-[94vw] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-ink-strong flex items-center gap-2"><Zap size={14} className="text-amber-400" /> Quy tắc mới</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-hover text-ink-dim"><X size={15} /></button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên quy tắc (vd: Mail từ sếp → HĐ BDG)" className={inp} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1.5">NẾU thư…</div>
            <div className="space-y-1.5">
              <input value={c.c_from} onChange={e => setC({ ...c, c_from: e.target.value })} placeholder="…có Người gửi chứa" className={inp} />
              <input value={c.c_subject} onChange={e => setC({ ...c, c_subject: e.target.value })} placeholder="…có Tiêu đề chứa" className={inp} />
              <input value={c.c_body} onChange={e => setC({ ...c, c_body: e.target.value })} placeholder="…có Nội dung chứa" className={inp} />
              <input value={c.c_to} onChange={e => setC({ ...c, c_to: e.target.value })} placeholder="…có Người nhận chứa" className={inp} />
              <div className="flex gap-4">
                {chk('chưa đọc', c.c_unread, v => setC({ ...c, c_unread: v }))}
                {chk('có tệp đính kèm', c.c_has_attachment, v => setC({ ...c, c_has_attachment: v }))}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1.5">THÌ…</div>
            <div className="space-y-1.5">
              <select value={a.a_folder_id} onChange={e => setA({ ...a, a_folder_id: e.target.value })} className={inp}>
                <option value="">(không chuyển thư mục)</option>
                {flat.map(f => <option key={f.id} value={f.id}>Chuyển vào: {f.name}</option>)}
              </select>
              <div className="flex flex-wrap gap-4">
                {chk('đánh dấu đã đọc', a.a_mark_read, v => setA({ ...a, a_mark_read: v }))}
                {chk('gắn sao', a.a_star, v => setA({ ...a, a_star: v }))}
              </div>
              <div className="flex gap-2">
                <select value={a.a_category} onChange={e => setA({ ...a, a_category: e.target.value })} className={inp}>
                  <option value="">(không phân loại)</option>
                  {(categories?.categories || []).map(cat => <option key={cat} value={cat}>Phân loại: {cat}</option>)}
                </select>
                <select value={a.a_flag_days} onChange={e => setA({ ...a, a_flag_days: e.target.value })} className={inp}>
                  <option value="">(không gắn cờ)</option>
                  {[1, 3, 7].map(d => <option key={d} value={d}>Cờ: {d === 1 ? 'Hôm nay' : d + ' ngày'}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button onClick={save} disabled={!name.trim()} className="btn-primary w-full py-2 text-sm disabled:opacity-50">Tạo quy tắc</button>
        </div>
      </div>
    </div>
  )
}
