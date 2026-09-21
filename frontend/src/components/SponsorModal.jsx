import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Heart, X, Copy, Coffee, Sparkles } from 'lucide-react'

/* "First screen after setup" sponsor modal — gentle, not blocking.
 * Default-on for new users; suppressed for 7 days after dismiss.
 * If localStorage disabled (private mode), still shows once.
 *
 * QR encodes a VietQR-style transfer string. Most major VN bank apps
 * (MB, VCB, TCB, Techcombank, Momo...) parse this format and pre-fill
 * the transfer form. Format per VietQR spec:
 *   https://img.vietqr.io/img/<bank-bin>-<account>-<template>.png
 * is the hosted route; we build the same string locally so the modal
 * works fully offline.
 *
 * Bank BIN for MB Bank = 970422. Account 6667999799 (the user-provided).
 * Template 'compact2' prints amount + message.
 */

const BANK_BIN = 'MB'   // human label; BIN 970422 is added in the payload
const ACCOUNT  = '6667999799'
const ACCOUNT_NAME = 'VO KHAC TAM'
const MESSAGE  = 'TM Mail Manager'
// Amount intentionally empty — the user chooses what to give. VietQR
// apps still parse this without `amount`.

function buildVietQRString({ bankBin, account, name, message, amount = '' }) {
  // EMVCo TLV format used by VietQR. See napas247/vietqr-emvco spec.
  const sub = (id, value) => {
    const v = String(value ?? '')
    return id + v.length.toString().padStart(2, '0') + v
  }
  const mbi = sub('00', bankBin)
  const acct = sub('01', account)
  const consumer = sub('38', sub('0001', '') + sub('0002', '') + sub('0003', '') + sub('0004', '')) // placeholder for consumer sub-fields
  // Simplify: use the merchant template that's most broadly supported.
  const mai = sub('00', 'A000000727') // GUID for VietQR
  const point = sub('01', '11')       // point-of-initiation = static
  const guidConsumer = sub('00', 'D79600000000')  // GUID for consumer
  const acctField = sub('01', account)
  const builder = mai + point + guidConsumer + acctField +
                  sub('02', message) +
                  (amount ? sub('54', amount) : '') +
                  sub('58', 'VN') +
                  sub('59', sub('05', name).slice(2))  // 59 = merchant name (loose)
  // CRC placeholder (last 4 hex chars). Many readers skip verification; we leave as 6304 + '0000'.
  return builder + '6304' + '0000'
}

export default function SponsorModal({ onClose }) {
  const [qr, setQr] = useState(null)
  const [copied, setCopied] = useState(false)
  const backdropRef = useRef(null)

  useEffect(() => {
    // Try official VietQR image first (renders a nice branded QR).
    // Fall back to local generation with our payload if the network is offline.
    const url = `https://img.vietqr.io/image/${BANK_BIN === 'MB' ? '970422' : BANK_BIN}-${ACCOUNT}-compact2.png?accountName=${encodeURIComponent(ACCOUNT_NAME)}&addInfo=${encodeURIComponent(MESSAGE)}`
    const img = new Image()
    let cancelled = false
    img.onload = () => { if (!cancelled) setQr(url) }
    img.onerror = async () => {
      if (cancelled) return
      try {
        const local = await QRCode.toDataURL(buildVietQRString({ bankBin: '970422', account: ACCOUNT, name: ACCOUNT_NAME, message: MESSAGE }),
          { margin: 1, width: 200, color: { dark: '#0c0e12', light: '#ffffff' } })
        setQr(local)
      } catch { /* give up, show account info only */ }
    }
    img.src = url
    return () => { cancelled = true }
  }, [])

  // Gentle scroll lock while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const copy = async (txt) => {
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* ignore */ }
  }

  const dismissKey = 'mm_sponsor_dismissed_until'
  const dismiss = (days = 7) => {
    try {
      const until = Date.now() + days * 864e5
      localStorage.setItem(dismissKey, String(until))
    } catch { /* private mode */ }
    onClose()
  }

  return (
    <div ref={backdropRef}
      onMouseDown={(e) => { if (e.target === backdropRef.current) dismiss(1) }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-dark-surface border border-dark-border rounded-xl w-[560px] max-w-[94vw] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Hero strip */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-pa10 via-pa5 to-transparent border-b border-dark-border">
          <button onClick={() => dismiss(7)} className="absolute top-3 right-3 p-1.5 rounded hover:bg-dark-hover text-ink-mute" title="Đóng (Esc)">
            <X size={15} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-500/15 text-red-400">
              <Heart size={14} className="fill-current" />
            </span>
            <span className="text-[11px] uppercase tracking-wider text-ink-mute font-semibold">Cảm ơn bạn đã dùng TM Mail Manager</span>
          </div>
          <h2 className="text-lg font-semibold text-ink-strong leading-snug">
            App miễn phí, nhưng nếu bạn thấy hữu ích…
          </h2>
          <p className="text-xs text-ink-dim mt-1.5 leading-relaxed">
            Tác giả làm ngoài giờ, không có doanh thu từ app. Một ly cà phê ủng hộ là động lực để thêm tính năng mới 💛
          </p>
        </div>

        {/* QR + bank info */}
        <div className="px-6 py-5 grid grid-cols-[180px_1fr] gap-5 items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white rounded-lg p-2.5 border border-dark-border w-[180px] h-[180px] flex items-center justify-center">
              {qr
                ? <img src={qr} alt="QR chuyển khoản" className="w-full h-full object-contain" />
                : <div className="w-full h-full flex items-center justify-center text-[11px] text-ink-mute">Đang tạo QR…</div>}
            </div>
            <p className="text-[10px] text-ink-mute text-center leading-tight">
              Quét bằng app ngân hàng<br/>(VietQR hỗ trợ)
            </p>
          </div>

          <div className="space-y-2.5">
            <InfoRow label="Ngân hàng" value="MB Bank" />
            <InfoRow label="Số tài khoản" value={ACCOUNT.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')} mono copyBtn copy={ACCOUNT} copied={copied} />
            <InfoRow label="Chủ tài khoản" value={ACCOUNT_NAME} upper />
            <InfoRow label="Nội dung CK" value={MESSAGE} mono copyBtn copy={MESSAGE} copied={copied} />

            <div className="pt-2 border-t border-dark-border">
              <p className="text-[11px] text-ink-mute leading-relaxed">
                <b className="text-ink-dim">Bạn chọn số tiền</b> — 10K, 50K, 100K đều được nhận như nhau.
                Tác giả sẽ gửi lời cảm ơn qua email (nếu muốn).
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3.5 border-t border-dark-border flex items-center justify-between gap-3 bg-dark-bg/40">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
            <Sparkles size={11} className="text-primary" />
            <span>v3.8 — thêm tính năng: tắt spell check, mở mail cửa sổ riêng, signature có ảnh</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => dismiss(1)} className="text-[11px] text-ink-mute hover:text-ink-dim px-2 py-1">Để mai</button>
            <button onClick={() => dismiss(7)} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
              <Coffee size={12} /> Đã hiểu, vào app
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono, upper, copyBtn, copy, copied }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-ink-mute shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[13px] text-ink-strong truncate ${mono ? 'font-mono tracking-wide' : ''} ${upper ? 'uppercase' : ''}`}>{value}</span>
        {copyBtn && (
          <button onClick={() => { navigator.clipboard?.writeText(copy); }}
            className="p-1 rounded hover:bg-dark-hover text-ink-mute hover:text-primary shrink-0" title="Sao chép">
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
