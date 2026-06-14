import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({ isOpen, title, message, confirmText = 'Ya', cancelText = 'Batal', variant = 'danger', onConfirm, onCancel }) {
  if (!isOpen) return null

  const colors = {
    danger: { bg: '#fef2f2', border: '#fecaca', btnBg: '#dc2626', btnText: 'white', iconColor: '#ef4444' },
    warning: { bg: '#fffbeb', border: '#fed7aa', btnBg: '#f59e0b', btnText: 'white', iconColor: '#f59e0b' },
    info: { bg: '#eff6ff', border: '#bfdbfe', btnBg: '#2563eb', btnText: 'white', iconColor: '#2563eb' },
  }

  const c = colors[variant] || colors.danger

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', padding: '16px',
      animation: 'fadeIn 0.15s ease',
    }} onClick={onCancel}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '28px',
        maxWidth: '420px', width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.2s ease',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={20} color={c.iconColor} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', flex: 1 }}>{title}</h3>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: '#9ca3af', borderRadius: '6px',
          }}><X size={18} /></button>
        </div>

        {/* Message */}
        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginBottom: '24px', paddingLeft: '52px' }}>
          {message}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: '8px', border: '1px solid #e5e7eb',
            background: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            color: '#374151',
          }}>
            {cancelText}
          </button>
          <button onClick={onConfirm} style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: c.btnBg, color: c.btnText, fontSize: '14px', fontWeight: '600',
            cursor: 'pointer',
          }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
