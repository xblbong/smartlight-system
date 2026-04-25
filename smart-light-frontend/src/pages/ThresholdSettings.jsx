import { useState, useEffect } from 'react'
import { Sun, Timer, Save, RotateCcw, Check } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

// ─── Toast (inline) ──────────────────────────────────────────
function InlineAlert({ type, message }) {
  if (!message) return null
  return (
    <div className={`inline-alert inline-alert-${type}`}>
      <Check size={14} />
      {message}
    </div>
  )
}

export default function ThresholdSettings({ token, onUnauthorized }) {
  const [settings, setSettings] = useState({ ldr_sensitivity: 420, pir_delay: 15 })
  const [rawInput, setRawInput] = useState('420')
  const [inputError, setInputError] = useState('')
  const [saving, setSaving]     = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [alertType, setAlertType] = useState('success')

  useEffect(() => {
    let active = true

    apiFetch('/api/settings', { token })
      .then(data => {
        if (!active) return

        if (data.ldr_sensitivity && !isNaN(parseInt(data.ldr_sensitivity))) {
          const v = parseInt(data.ldr_sensitivity)
          setSettings(prev => ({ ...prev, ldr_sensitivity: v }))
          setRawInput(String(v))
        }

        if (data.pir_delay && !isNaN(parseInt(data.pir_delay))) {
          setSettings(prev => ({ ...prev, pir_delay: parseInt(data.pir_delay) }))
        }
      })
      .catch(error => {
        console.error('Threshold settings fetch error:', error)

        if (error.status === 401) {
          onUnauthorized?.()
          return
        }

        setAlertMsg(getErrorMessage(error, 'Gagal memuat konfigurasi sistem.'))
        setAlertType('error')
      })

    return () => {
      active = false
    }
  }, [token, onUnauthorized])

  // Handle number input with validation
  const handleInputChange = (val) => {
    setRawInput(val)
    const n = parseInt(val)
    if (isNaN(n) || val.trim() === '') {
      setInputError('Input harus angka antara 0–1024')
    } else if (n < 0 || n > 1024) {
      setInputError('Nilai harus antara 0 dan 1024')
    } else {
      setInputError('')
      setSettings(s => ({ ...s, ldr_sensitivity: n }))
    }
  }

  // Sync slider → input
  const handleSliderChange = (val) => {
    const n = parseInt(val)
    setSettings(s => ({ ...s, ldr_sensitivity: n }))
    setRawInput(String(n))
    setInputError('')
  }

  const handleSave = async () => {
    if (inputError) return
    setSaving(true)
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        token,
        body: settings,
      })
      setAlertMsg('Konfigurasi berhasil disimpan!')
      setAlertType('success')
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized?.()
        return
      }

      setAlertMsg(getErrorMessage(error, 'Gagal menyimpan konfigurasi.'))
      setAlertType('error')
    } finally {
      setSaving(false)
      setTimeout(() => setAlertMsg(''), 3500)
    }
  }

  const handleReset = () => {
    setSettings({ ldr_sensitivity: 420, pir_delay: 15 })
    setRawInput('420')
    setInputError('')
  }

  // Efficiency estimate based on threshold
  const effPct = Math.round(60 + (settings.ldr_sensitivity / 1024) * 30)

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div className="page-title-wrap">
          <h4>COMMAND CONSOLE</h4>
          <h1>System Thresholds</h1>
        </div>
        <p style={{ maxWidth: '600px', color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '8px' }}>
          Fine-tune the environmental triggers for the campus lighting grid.
          Adjust sensitivity levels for ambient light detection and motion-based occupancy timers.
        </p>
      </div>

      <InlineAlert type={alertType} message={alertMsg} />

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* LDR Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '4px' }}>LDR Sensitivity</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Light Dependent Resistor calibration</p>
            </div>
            <div style={{ width: '48px', height: '48px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sun size={24} color="var(--accent-blue)" />
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Ambient Light Trigger Level</span>
              <span style={{ fontSize: '26px', fontWeight: '800', color: 'var(--accent-blue)' }}>
                {settings.ldr_sensitivity}{' '}
                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>lux</span>
              </span>
            </div>
            <input
              type="range"
              className="range-slider"
              min="0"
              max="1024"
              value={settings.ldr_sensitivity}
              onChange={e => handleSliderChange(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              <span>DARK (0)</span>
              <span>DIRECT SUN (1024)</span>
            </div>
          </div>

          {/* Number Input */}
          <div style={{ marginTop: 'auto' }}>
            <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              MANUAL SENSITIVITY OFFSET
            </label>
            <input
              type="number"
              className={`form-input${inputError ? ' is-error' : ''}`}
              value={rawInput}
              min="0"
              max="1024"
              onChange={e => handleInputChange(e.target.value)}
              style={{ padding: '12px', fontSize: '16px' }}
              placeholder="0 – 1024"
            />
            {inputError && (
              <p className="field-error-text" style={{ fontSize: '12px', color: 'var(--accent-red)', marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                ⚠ {inputError}
              </p>
            )}
          </div>
        </div>

        {/* Efficiency Panel */}
        <div className="card" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: 'white', padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', marginBottom: '24px', width: 'fit-content' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#86efac' }} />
            LIVE SIMULATION
          </div>
          <h2 style={{ fontSize: '42px', fontWeight: '800', marginBottom: '12px' }}>{effPct}% Efficient</h2>
          <p style={{ color: '#bfdbfe', lineHeight: '1.6', fontSize: '14px' }}>
            Based on current threshold settings, energy waste is minimized by {effPct}% compared to standard timer-based systems.
          </p>
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '8px' }}>THRESHOLD PREVIEW</div>
            <div style={{ fontSize: '13px', color: 'white' }}>
              Lampu menyala saat lux &lt; <strong>{settings.ldr_sensitivity}</strong> dan jarak &lt; 30 cm
            </div>
          </div>
        </div>
      </div>

      {/* ── PIR Delay Card ── */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 32px', marginBottom: '32px', background: '#f8fafc', border: '1px solid var(--border-color)', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '52px', height: '52px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
            <Timer size={26} color="var(--accent-green)" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Ultrasonik Masa Tunggu</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Delay setelah objek tidak terdeteksi sebelum lampu meredup (menit)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '10px', padding: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
            <button
              className="btn btn-outline"
              style={{ border: 'none', padding: '8px 18px', fontSize: '20px', lineHeight: 1 }}
              onClick={() => setSettings(s => ({ ...s, pir_delay: Math.max(1, s.pir_delay - 1) }))}
            >−</button>
            <div style={{ padding: '0 20px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '28px', fontWeight: '800' }}>{settings.pir_delay}</div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>MENIT</div>
            </div>
            <button
              className="btn btn-outline"
              style={{ border: 'none', padding: '8px 18px', fontSize: '20px', lineHeight: 1 }}
              onClick={() => setSettings(s => ({ ...s, pir_delay: Math.min(60, s.pir_delay + 1) }))}
            >+</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>STATUS</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-green)' }}>Optimal</div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-green)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" style={{ padding: '12px 24px' }} onClick={handleReset}>
          <RotateCcw size={16} /> Reset to Defaults
        </button>
        <button
          className="btn btn-primary"
          style={{ padding: '12px 28px' }}
          onClick={handleSave}
          disabled={saving || !!inputError}
        >
          <Save size={16} />
          {saving ? 'Menyimpan...' : 'Apply Configuration'}
        </button>
      </div>
    </div>
  )
}
