import React, { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, Palette } from 'lucide-react'

/* Minimal Outlook-like rich editor: contentEditable + font/size/color/B-I-U.
   onChange receives innerHTML. onPasteFiles receives dropped/pasted File objects
   (Outlook behavior: pasted screenshots become attachments). */
const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Tahoma', 'Verdana', 'JetBrains Mono']
const SIZES = [{ px: '12', v: '2' }, { px: '13', v: '3' }, { px: '14', v: '4' }, { px: '16', v: '5' }, { px: '18', v: '6' }, { px: '24', v: '7' }]

export default function RichEditor({ html, onChange, onPasteFiles, fontFamily = 'Calibri', fontSize = '14px', minHeight = 180, placeholder = 'Nội dung…', toolbarBottom = false }) {
  const ref = useRef(null)
  const focusedRef = useRef(false)

  useEffect(() => {  // push external value only when not focused (avoid caret jump)
    if (ref.current && !focusedRef.current && ref.current.innerHTML !== (html || '')) {
      ref.current.innerHTML = html || ''
    }
  }, [html])

  useEffect(() => {
    if (ref.current && !ref.current.innerHTML && html) ref.current.innerHTML = html
  }, [])  // eslint-disable-line

  const exec = (cmd, val) => { document.execCommand(cmd, false, val); onChange?.(ref.current?.innerHTML || '') }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || []
    const imageFiles = []
    const otherFiles = []
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (!f) continue
        if (f.type.startsWith('image/')) {
          imageFiles.push(f)
        } else {
          otherFiles.push(f)
        }
      }
    }
    // Image files: insert inline as base64 img (so they appear in the body immediately).
    // Non-image files: send to attachment list (Outlook behavior).
    if (imageFiles.length) {
      e.preventDefault()
      const imgs = imageFiles.map(f => new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(`<img src="${reader.result}" alt="${f.name || 'pasted image'}" style="max-width:100%;height:auto;display:block;margin:6px 0" />`)
        reader.readAsDataURL(f)
      }))
      Promise.all(imgs).then(htmls => {
        // Insert at cursor in the contenteditable
        document.execCommand('insertHTML', false, htmls.join(''))
        onChange?.(ref.current?.innerHTML || '')
        onPasteFiles?.(imageFiles, /*inline=*/true)
      })
    }
    if (otherFiles.length && onPasteFiles) {
      e.preventDefault()
      onPasteFiles(otherFiles, /*inline=*/false)
    }
  }

  const Toolbar = (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-dark-bg bg-dark-surface flex-wrap">
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} title="Đậm"
        className="p-1 rounded hover:bg-dark-hover text-ink-dim"><Bold size={13} /></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} title="Nghiêng"
        className="p-1 rounded hover:bg-dark-hover text-ink-dim"><Italic size={13} /></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} title="Gạch chân"
        className="p-1 rounded hover:bg-dark-hover text-ink-dim"><Underline size={13} /></button>
      <input type="color" title="Màu chữ" onMouseDown={e => e.stopPropagation()}
        onChange={e => exec('foreColor', e.target.value)}
        className="w-5 h-5 bg-transparent border border-dark-border rounded cursor-pointer p-0" />
      <span className="w-px h-4 bg-dark-border mx-1" />
      <select value={fontFamily} onChange={e => exec('fontName', e.target.value)} title="Phông chữ"
        className="bg-transparent text-[11px] text-ink-dim border border-dark-border rounded px-1 py-0.5 focus:outline-none">
        {FONTS.map(f => <option key={f} value={f} className="bg-dark-surface">{f}</option>)}
      </select>
      <select onChange={e => { document.execCommand('styleWithCSS', false, true); exec('fontSize', e.target.value) }} value="" title="Cỡ chữ"
        className="bg-transparent text-[11px] text-ink-dim border border-dark-border rounded px-1 py-0.5 focus:outline-none">
        <option value="" disabled>Aa</option>
        {SIZES.map(s => <option key={s.px} value={s.v} className="bg-dark-surface">{s.px}</option>)}
      </select>
      <span className="flex-1" />
      <Palette size={12} className="text-ink-mute opacity-50" />
    </div>
  )

  const Content = (
    <div className="px-3 py-2.5 text-ink overflow-y-auto flex-1 min-h-0">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-placeholder={placeholder}
        onFocus={() => { focusedRef.current = true }}
        onBlur={() => { focusedRef.current = false; onChange?.(ref.current?.innerHTML || '') }}
        onInput={() => onChange?.(ref.current?.innerHTML || '')}
        onPaste={handlePaste}
        onDrop={e => { if (onPasteFiles && e.dataTransfer?.files?.length) { e.preventDefault(); onPasteFiles([...e.dataTransfer.files]) } }}
        className="rich-editor-content focus:outline-none"
        style={{ fontFamily, fontSize, minHeight }}
      />
    </div>
  )

  return (
    <div className="border border-dark-border rounded-md bg-dark-bg overflow-hidden flex flex-col">
      {toolbarBottom ? <>{Toolbar}{Content}</> : <>{Content}{Toolbar}</>}
    </div>
  )
}
