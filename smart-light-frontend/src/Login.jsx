import { useState } from 'react'
import ubLogo from './assets/ub_logo.png'
import './Login.css'

// ─── SVG Icons ────────────────────────────────────────────────
const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconLock = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const IconEye = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconAlertCircle = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconCheck = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

// ─── Login Component ──────────────────────────────────────────
export default function Login({ onLoginSuccess }) {
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' })

  // ── Validasi sisi klien ──
  const validate = () => {
    const errs = { email: '', password: '' }
    let valid = true

    if (!email.trim()) {
      errs.email = 'Email wajib diisi.'
      valid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Format email tidak valid.'
      valid = false
    }

    if (!password) {
      errs.password = 'Password wajib diisi.'
      valid = false
    } else if (password.length < 4) {
      errs.password = 'Password minimal 4 karakter.'
      valid = false
    }

    setFieldErrors(errs)
    return valid
  }

  // ── Submit handler ──
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validate()) return

    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      const data = await res.json()

      if (res.ok && data.status === 'success') {
        setSuccess('Login berhasil! Mengalihkan ke dashboard...')
        // Simpan token di localStorage
        localStorage.setItem('auth_token', data.token)
        localStorage.setItem('auth_user', JSON.stringify(data.user))

        // Tunggu sebentar lalu navigasi ke dashboard
        setTimeout(() => {
          onLoginSuccess(data.token, data.user)
        }, 1000)
      } else {
        // Error dari server (401, 422, dll)
        if (res.status === 422 && data.errors) {
          const errs = { email: '', password: '' }
          if (data.errors.email)    errs.email    = data.errors.email[0]
          if (data.errors.password) errs.password = data.errors.password[0]
          setFieldErrors(errs)
        } else {
          setError(data.message || 'Terjadi kesalahan. Coba lagi.')
        }
      }
    } catch {
      setError('Tidak dapat terhubung ke server. Pastikan backend berjalan.')
    } finally {
      setLoading(false)
    }
  }

  // Clear error saat user mengetik
  const handleEmailChange = (v) => {
    setEmail(v)
    if (fieldErrors.email) setFieldErrors(f => ({ ...f, email: '' }))
    if (error) setError('')
  }

  const handlePasswordChange = (v) => {
    setPassword(v)
    if (fieldErrors.password) setFieldErrors(f => ({ ...f, password: '' }))
    if (error) setError('')
  }

  return (
    <div className="login-page">
      {/* Watermark */}
      <div className="login-watermark" aria-hidden="true">
        FACILITIES<br />MANAGEMENT
      </div>

      {/* Card */}
      <div className="login-card" role="main">

        {/* Logo & Judul */}
        <div className="login-logo-wrap">
          <img
            src={ubLogo}
            alt="Logo UB Adaptive"
            className="login-logo"
          />
          <h1 className="login-title">UB Adaptive</h1>
          <p className="login-subtitle">Smart Lighting Admin</p>
        </div>

        {/* Alert Error */}
        {error && (
          <div className="login-error" role="alert" aria-live="polite">
            <IconAlertCircle />
            <span>{error}</span>
          </div>
        )}

        {/* Alert Success */}
        {success && (
          <div className="login-success" role="status" aria-live="polite">
            <IconCheck />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="admin-email" className="form-label">
              Admin Username
            </label>
            <div className="input-wrap">
              <span className="input-icon">
                <IconUser />
              </span>
              <input
                id="admin-email"
                type="email"
                className={`form-input${fieldErrors.email ? ' is-error' : ''}`}
                placeholder="admin@ub.ac.id"
                value={email}
                onChange={e => handleEmailChange(e.target.value)}
                autoComplete="email"
                autoFocus
                disabled={loading}
                aria-describedby={fieldErrors.email ? 'email-err' : undefined}
                aria-invalid={!!fieldErrors.email}
              />
            </div>
            {fieldErrors.email && (
              <p className="field-error" id="email-err" role="alert">
                <IconAlertCircle />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="admin-password" className="form-label">
              Secure Password
            </label>
            <div className="input-wrap">
              <span className="input-icon">
                <IconLock />
              </span>
              <input
                id="admin-password"
                type={showPw ? 'text' : 'password'}
                className={`form-input${fieldErrors.password ? ' is-error' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={e => handlePasswordChange(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                aria-describedby={fieldErrors.password ? 'pw-err' : undefined}
                aria-invalid={!!fieldErrors.password}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                tabIndex={-1}
                disabled={loading}
              >
                {showPw ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="field-error" id="pw-err" role="alert">
                <IconAlertCircle />
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="login-divider" />

          {/* Tombol Submit */}
          <button
            type="submit"
            className="btn-login"
            id="btn-masuk"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Memproses...
              </>
            ) : (
              <>
                MASUK
                <span className="btn-arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p>Authorized Personnel Only.</p>
          <p>Sistem Monitoring Pencahayaan Pintar UB.</p>
        </div>
      </div>
    </div>
  )
}
