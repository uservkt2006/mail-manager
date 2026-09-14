import React, { useState, useEffect, useCallback } from 'react'
import FolderTree from './FolderTree'
import EmailList from './EmailList'
import EmailDetail from './EmailDetail'
import ComposeModal from './ComposeModal'
import { api } from '../api'

export default function MailView({ user }) {
  const [tree, setTree] = useState([])
  const [activeFolder, setActiveFolder] = useState(null)
  const [emails, setEmails] = useState([])
  const [selected, setSelected] = useState(null)
  const [conversation, setConversation] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [compose, setCompose] = useState(false)
  const [toast, setToast] = useState(null)
  const undoRef = useState(() => ({}))[0]

  const showToast = (msg, action) => {
    setToast({ msg, action })
    setTimeout(() => setToast(null), 5000)
  }

  const loadTree = useCallback(async () => {
    const d = await api.folders()
    setTree(d.tree)
    if (!activeFolder && d.tree.length) {
      const inbox = d.tree.find(f => f.type === 'inbox')
      if (inbox) setActiveFolder(inbox)
    }
  }, [activeFolder])

  const loadEmails = useCallback(async () => {
    if (!activeFolder) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        folder: String(activeFolder.id),
        conversation: String(conversation)
      })
      if (search) params.append('search', search)
      if (category) params.append('category', category)
      const d = await api.emails(params)
      setEmails(d.emails)
    } finally {
      setLoading(false)
    }
  }, [activeFolder, conversation, search, category])

  useEffect(() => { loadTree() }, [])
  useEffect(() => { loadEmails() }, [loadEmails])

  const wrap = (fn) => async (id) => {
    const prevEmails = emails
    const prevSel = selected
    fn(id).then(loadEmails)
    return { undo: () => { setEmails(prevEmails); setSelected(prevSel) } }
  }

  const actArchive = async (id) => {
    const item = emails.find(it => (it.email?.id || it.id) === id)
    const fromFolder = (item?.email || item)?.folder_id
    await api.archive(id)
    if (selected?.id === id) setSelected(null)
    loadEmails(); loadTree()
    if (fromFolder) showToast('Đã chuyển vào Lưu trữ', async () => { await api.move(id, fromFolder); loadEmails(); loadTree() })
  }

  const actDelete = async (id) => {
    await api.del(id)
    if (selected?.id === id) setSelected(null)
    loadEmails(); loadTree()
    showToast('Đã chuyển vào Thùng rác', async () => { await api.restore(id); loadEmails(); loadTree() })
  }

  const actStar = async (id) => { await api.star(id); loadEmails() }
  const actFlag = async (id, due) => { await api.flag(id, due); loadEmails() }
  const actMove = async (id, folderId) => { await api.move(id, folderId); setSelected(null); loadEmails(); loadTree() }
  const actTask = async (id) => {
    const r = await api.emailToTask(id)
    showToast('Đã tạo việc từ email — xem tab To Do')
    return r
  }
  const actSelect = async (email) => {
    setSelected(email)
    if (!email.is_read) {
      await api.markRead(email.id, true)
      setEmails(prev => prev.map(it => (it.email?.id === email.id || it.id === email.id)
        ? { ...it, email: { ...(it.email || it), is_read: true }, ...(it.email ? {} : { is_read: true }) }
        : it))
      loadTree()
    }
  }

  const itemInfo = `${emails.length} hội thoại · ${activeFolder?.name || ''}`

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <FolderTree tree={tree} activeFolderId={activeFolder?.id}
        onSelect={(f) => { setActiveFolder(f); setSelected(null) }} onChanged={loadTree} />
      <EmailList
        emails={emails} activeFolder={activeFolder} selectedEmailId={selected?.id}
        onEmailSelect={actSelect} onArchive={actArchive} onDelete={actDelete} onStar={actStar}
        onMove={actMove} tree={tree}
        onRefresh={() => { loadEmails(); loadTree() }}
        conversationView={conversation} onToggleConversation={() => setConversation(!conversation)}
        searchTerm={search} onSearchChange={setSearch}
        selectedCategory={category} onCategoryChange={setCategory}
        loading={loading} itemInfo={itemInfo}
      />
      <EmailDetail
        email={selected} folders={tree}
        onArchive={actArchive} onDelete={actDelete} onStar={actStar} onFlag={actFlag}
        onMove={actMove} onCreateTask={actTask}
        onReply={() => setCompose({ replyTo: selected })}
        onRefresh={() => { loadEmails(); loadTree() }}
      />
      {compose && (
        <ComposeModal
          replyTo={compose.replyTo} user={user}
          onClose={() => setCompose(false)}
          onSent={() => { setCompose(false); loadEmails(); loadTree() }}
        />
      )}
      {toast && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-dark-surface border border-dark-border rounded-lg shadow-2xl px-4 py-2.5 flex items-center gap-3 z-50">
          <span className="text-sm text-gray-200">{toast.msg}</span>
          {toast.action && <button onClick={toast.action} className="text-sm text-primary font-medium hover:underline">Hoàn tác</button>}
        </div>
      )}
    </div>
  )
}
