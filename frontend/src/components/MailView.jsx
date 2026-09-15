import React, { useState, useEffect, useCallback } from 'react'
import FolderTree from './FolderTree'
import EmailList from './EmailList'
import EmailDetail from './EmailDetail'
import ComposeModal from './ComposeModal'
import ContextMenu from './ContextMenu'
import ReadingModal from './ReadingModal'
import SearchFolderModal from './SearchFolderModal'
import RuleModal from './RuleModal'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { Archive, Trash2, Star, Mail, MailOpen, Flag, Tag, Share2, CornerUpLeft, CornerUpRight, FolderInput, CheckCheck, Zap } from 'lucide-react'
import { api } from '../api'
import { getDensity, getReadingPane } from '../theme'

export default function MailView({ user, catMeta: catMetaProp, onOpenSettings }) {
  const [catMeta, setCatMeta] = useState(catMetaProp)
  useEffect(() => { if (catMetaProp) setCatMeta(catMetaProp); else api.categories().then(setCatMeta).catch(() => {}) }, [catMetaProp])
  const [tree, setTree] = useState([])
  const [activeFolder, setActiveFolder] = useState(null)
  const [emails, setEmails] = useState([])
  const [selected, setSelected] = useState(null)
  const [conversation, setConversation] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [compose, setCompose] = useState(null)
  const [ctx, setCtx] = useState(null)          // {email, x, y}
  const [searchFolders, setSearchFolders] = useState([])
  const [sfModal, setSfModal] = useState(false)
  const [ruleFor, setRuleFor] = useState(null)   // email used to prefill a new rule
  const [readModal, setReadModal] = useState(false)
  const outerLayout = useDefaultLayout({ id: 'mm-mail', storage: window.localStorage, panelIds: ['folders', 'main'] })
  const innerLayout = useDefaultLayout({ id: 'mm-main', storage: window.localStorage, panelIds: ['list', 'detail'] })
  const [toast, setToast] = useState(null)
  const [density, setDensity] = useState(getDensity())
  const [pane, setPane] = useState(getReadingPane())   // right | bottom | off

  const showToast = (msg, action) => {
    setToast({ msg, action })
    setTimeout(() => setToast(null), 5000)
  }

  const loadSf = useCallback(() => { api.searchFolders().then(setSearchFolders).catch(() => {}) }, [])

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
      const params = new URLSearchParams({ folder: String(activeFolder.id), conversation: String(conversation) })
      if (search) params.append('search', search)
      if (category) params.append('category', category)
      const d = await api.emails(params)
      setEmails(d.emails)
    } finally { setLoading(false) }
  }, [activeFolder, conversation, search, category])

  useEffect(() => { loadTree(); loadSf() }, [])
  useEffect(() => { loadEmails() }, [loadEmails])


  useEffect(() => {
    const bump = () => { setDensity(getDensity()); setPane(getReadingPane()); loadEmails(); loadTree() }
    const newMail = () => setCompose({ mode: 'new' })
    window.addEventListener('mm-theme', bump)
    window.addEventListener('mm-synced', bump)
    window.addEventListener('mm-new-mail', newMail)
    return () => { window.removeEventListener('mm-theme', bump); window.removeEventListener('mm-synced', bump); window.removeEventListener('mm-new-mail', newMail) }
  }, [loadEmails, loadTree])

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
  const actRead = async (id, is_read) => { await api.markRead(id, is_read); loadEmails() }
  const actCats = async (id, cats) => { await api.setCats(id, cats); loadEmails() }
  const actReadAll = async () => { const r = await api.readAll(activeFolder.id); showToast(`Đã đánh dấu ${r.marked} thư là đã đọc`); loadEmails(); loadTree() }
  const actTask = async () => { if (selected) { await api.emailToTask(selected.id); showToast('Đã tạo việc từ email — xem tab To Do') } }

  const openSearchFolder = (sf) => { setActiveFolder({ id: sf.id, name: sf.name, unread: 0 }); setSelected(null) }
  const deleteSearchFolder = async (id) => {
    await api.deleteSearchFolder(id)
    loadSf()
    if (String(activeFolder?.id) === id) { const t = await api.folders(); setActiveFolder(t.tree.find(f => f.type === 'inbox') || null) }
    loadEmails()
  }

  const actSelect = async (email) => {
    setSelected(email)
    if (!email.is_read) {
      await api.markRead(email.id, true)
      setEmails(prev => prev.map(it => {
        const e = it.email || it
        if (e.id !== email.id) return it
        const patched = { ...e, is_read: true }
        return it.email ? { ...it, email: patched } : patched
      }))
      loadTree()
    }
  }

  // keyboard: j/k/enter/e/d/u/r/a/f handled globally here (list-scoped)
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return
      if (compose || ctx) return
      const list = emails.map(it => it.email || it)
      const idx = selected ? list.findIndex(x => x.id === selected.id) : -1
      const k = e.key.toLowerCase()
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (list[idx + 1]) actSelect(list[idx + 1]) }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (list[idx - 1]) actSelect(list[idx - 1]) }
      else if (k === 'e' && selected) actArchive(selected.id)
      else if ((k === 'd' || e.key === 'Delete') && selected) actDelete(selected.id)
      else if (k === 'u' && e.shiftKey) actReadAll()
      else if (k === 'u' && selected) actRead(selected.id, !selected.is_read)
      else if (k === 'r' && selected) setCompose({ replyTo: selected, mode: 'reply' })
      else if (k === 'a' && selected) setCompose({ replyTo: selected, mode: 'reply_all' })
      else if (k === 'f' && selected) setCompose({ replyTo: selected, mode: 'forward' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emails, selected, compose, ctx, activeFolder])

  const flatFolders = React.useMemo(() => {
    const out = []
    const walk = (nodes) => nodes.forEach(n => { out.push(n); if (n.children) walk(n.children) })
    walk(tree); return out
  }, [tree])

  const catSub = (email) => (catMeta?.categories || []).map(c => ({
    label: c, dot: catMeta?.colors?.[c],
    onClick: () => {
      const cur = Array.isArray(email.categories) ? email.categories : []
      actCats(email.id, cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c])
    }
  }))

  const menuItems = (email) => [
    { label: email.is_read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc', icon: email.is_read ? Mail : MailOpen, onClick: () => actRead(email.id, !email.is_read) },
    { sep: true },
    { label: 'Trả lời', icon: CornerUpLeft, onClick: () => setCompose({ replyTo: email, mode: 'reply' }) },
    { label: 'Trả lời tất cả', icon: CornerUpRight, onClick: () => setCompose({ replyTo: email, mode: 'reply_all' }) },
    { label: 'Chuyển tiếp', icon: Share2, onClick: () => setCompose({ replyTo: email, mode: 'forward' }) },
    { sep: true },
    { label: 'Cờ theo dõi', icon: Flag, submenu: [
      { label: 'Hôm nay', onClick: () => { const d = new Date(); d.setHours(17, 0, 0, 0); actFlag(email.id, d.toISOString()) } },
      { label: 'Tuần này', onClick: () => actFlag(email.id, new Date(Date.now() + 5 * 864e5).toISOString()) },
      { label: 'Bỏ cờ', onClick: () => actFlag(email.id, null) },
    ] },
    { label: 'Phân loại', icon: Tag, submenu: catSub(email) },
    { label: 'Di chuyển tới', icon: FolderInput, submenu: flatFolders.filter(f => f.id !== email.folder_id).map(f => ({ label: f.name, onClick: () => actMove(email.id, f.id) })) },
    { label: 'Tạo quy tắc từ thư này…', icon: Zap, onClick: () => setRuleFor(email) },
    { sep: true },
    { label: 'Lưu trữ', icon: Archive, onClick: () => actArchive(email.id) },
    { label: 'Xóa', icon: Trash2, danger: true, onClick: () => actDelete(email.id) },
    { sep: true },
    { label: 'Đánh dấu tất cả đã đọc', icon: CheckCheck, onClick: actReadAll },
  ]

  const itemInfo = `${emails.length} hội thoại · ${activeFolder?.name || ''} · chuột phải thư để có menu nhanh`

  return (
    <Group id="mm-mail" key={`mm-mail-${pane}`} orientation="horizontal" className="flex-1 min-w-0" defaultLayout={outerLayout.defaultLayout} onLayoutChanged={outerLayout.onLayoutChanged}>
      <Panel id="folders" defaultSize={232} minSize={180} maxSize={340} className="min-w-0">
        <FolderTree tree={tree} activeFolderId={activeFolder?.id}
          onCompose={() => setCompose({ mode: 'new' })}
          searchFolders={searchFolders} onOpenSearchFolder={openSearchFolder}
          onDeleteSearchFolder={deleteSearchFolder} onNewSearchFolder={() => setSfModal(true)}
          onSelect={(f) => { setActiveFolder(f); setSelected(null) }} onChanged={loadTree} />
      </Panel>
      <Separator className="mm-handle" />
      <Panel id="main" minSize={300}>
        <Group id="mm-main" key={`mm-main-${pane}`} orientation={pane === 'bottom' ? 'vertical' : 'horizontal'} className="h-full w-full" defaultLayout={innerLayout.defaultLayout} onLayoutChanged={innerLayout.onLayoutChanged}>
          <Panel id="list" defaultSize={pane === 'bottom' ? '55%' : 368} minSize={pane === 'bottom' ? '30%' : 280} className="min-w-0 min-h-0">
            <EmailList
              emails={emails} activeFolder={activeFolder} selectedEmailId={selected?.id}
              onEmailSelect={actSelect} onEmailOpen={(e) => pane === 'off' && setReadModal(true)}
              onArchive={actArchive} onDelete={actDelete} onStar={actStar} onFlag={actFlag}
              onMove={actMove} onMarkRead={actRead} onCategory={actCats}
              onContext={(email, x, y) => setCtx({ email, x, y })}
              catMeta={catMeta} density={density}
              onRefresh={() => { loadEmails(); loadTree() }}
              conversationView={conversation} onToggleConversation={() => setConversation(!conversation)}
              searchTerm={search} onSearchChange={setSearch}
              selectedCategory={category} onCategoryChange={setCategory}
              loading={loading} itemInfo={itemInfo}
            />
          </Panel>
          {pane !== 'off' && <>
            <Separator className={pane === 'bottom' ? 'mm-handle mm-handle-h' : 'mm-handle'} />
            <Panel id="detail" minSize={pane === 'bottom' ? '25%' : 300} className="min-w-0 min-h-0">
              <EmailDetail
                email={selected} folders={tree}
                onArchive={actArchive} onDelete={actDelete} onStar={actStar} onFlag={actFlag}
                onMove={actMove} onCreateTask={actTask}
                onReply={(mode) => setCompose({ replyTo: selected, mode })}
                onRefresh={() => { loadEmails(); loadTree() }}
              />
            </Panel>
          </>}
        </Group>
      </Panel>
      {readModal && pane === 'off' && selected && (
        <ReadingModal email={selected} folders={tree} onClose={() => setReadModal(false)}
          onArchive={actArchive} onDelete={actDelete} onStar={actStar} onFlag={actFlag}
          onMove={actMove} onCreateTask={actTask}
          onReply={(mode) => { setReadModal(false); setCompose({ replyTo: selected, mode }) }}
          onRefresh={() => { loadEmails(); loadTree() }} />
      )}
      {compose && (
        <ComposeModal
          replyTo={compose.replyTo} mode={compose.mode || 'new'} user={user}
          onClose={() => setCompose(false)}
          onSent={() => { setCompose(false); loadEmails(); loadTree() }}
        />
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={menuItems(ctx.email)} onClose={() => setCtx(null)} />}
      {sfModal && <SearchFolderModal folders={tree} onClose={() => setSfModal(false)} onCreated={() => { loadSf() }} />}
      {ruleFor && (
        <RuleModal folders={tree} categories={catMeta} initial={ruleFor}
          onClose={() => setRuleFor(null)}
          onCreated={async () => { const r = await api.runRules(); showToast(`Đã chạy quy tắc — khớp ${r.messages_matched} thư`); loadEmails(); loadTree() }} />
      )}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-dark-surface border border-dark-border rounded-lg shadow-2xl px-4 py-2.5 flex items-center gap-3 z-[60]">
          <span className="text-sm text-ink">{toast.msg}</span>
          {toast.action && <button onClick={toast.action} className="text-sm text-primary font-medium hover:underline">Hoàn tác</button>}
        </div>
      )}
    </Group>
  )
}
