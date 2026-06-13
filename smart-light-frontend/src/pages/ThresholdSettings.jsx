import { useState, useEffect } from 'react'
import { Sun, Timer, Save, RotateCcw, Check, GitBranch, Settings, Link2, AlertCircle } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'
import ConfirmModal from '../components/ConfirmModal'

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
  const [settings, setSettings] = useState({ lux_threshold: 100, pir_delay: 15 })
  const [rawInput, setRawInput] = useState('100')
  const [inputError, setInputError] = useState('')
  const [saving, setSaving] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')
  const [alertType, setAlertType] = useState('success')
  const [modal, setModal] = useState(null)

  useEffect(() => {
    let active = true

    apiFetch('/settings', { token })
      .then(data => {
        if (!active) return

        if (data.lux_threshold && !isNaN(parseInt(data.lux_threshold))) {
          const v = parseInt(data.lux_threshold)
          setSettings(prev => ({ ...prev, lux_threshold: v }))
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
      setInputError('Input harus angka antara 0–500 lux')
    } else if (n < 0 || n > 500) {
      setInputError('Nilai harus antara 0 dan 500 lux')
    } else {
      setInputError('')
      setSettings(s => ({ ...s, lux_threshold: n }))
    }
  }

  // Sync slider → input
  const handleSliderChange = (val) => {
    const n = parseInt(val)
    setSettings(s => ({ ...s, lux_threshold: n }))
    setRawInput(String(n))
    setInputError('')
  }

  const handleSaveClick = () => {
    if (inputError) return
    setModal({
      title: 'Simpan Konfigurasi',
      message: `Yakin ingin menyimpan pengaturan? Lux Threshold: ${settings.lux_threshold} lux, Delay: ${settings.pir_delay} detik.`,
      variant: 'info',
      confirmText: 'Ya, Simpan',
      onConfirm: () => {
        setModal(null)
        doSave()
      },
    })
  }

  const doSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/settings', {
        method: 'POST',
        token,
        body: {
          lux_threshold: settings.lux_threshold.toString(),
          pir_delay: settings.pir_delay.toString(),
        },
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
    setSettings({ lux_threshold: 100, pir_delay: 15 })
    setRawInput('100')
    setInputError('')
  }

  // Efficiency estimate based on threshold (outdoor: 20-500 lux range)
  const effPct = Math.round(60 + (settings.lux_threshold / 500) * 30)

  // Delay labels
  const getDelayLabel = (val) => {
    if (val <= 5) return 'Sangat Cepat'
    if (val <= 15) return 'Cepat'
    if (val <= 30) return 'Normal'
    if (val <= 45) return 'Lama'
    return 'Sangat Lama'
  }

  const getDelayColor = (val) => {
    if (val <= 5) return '#ef4444'
    if (val <= 15) return '#f59e0b'
    if (val <= 30) return '#10b981'
    if (val <= 45) return '#3b82f6'
    return '#8b5cf6'
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div className="page-title-wrap">
          <h4>PENGATURAN SISTEM</h4>
          <h1>Konfigurasi Thresholds</h1>
          <p style={{ maxWidth: '600px', color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '8px' }}>
            Atur parameter sensor untuk sistem pencahayaan kampus. Sesuaikan tingkat sensitivitas deteksi cahaya dan timer kehadiran objek.
          </p>
        </div>
      </div>

      <InlineAlert type={alertType} message={alertMsg} />
      <ConfirmModal
        isOpen={!!modal}
        title={modal?.title || ''}
        message={modal?.message || ''}
        variant={modal?.variant || 'info'}
        confirmText={modal?.confirmText || 'Ya'}
        onConfirm={modal?.onConfirm || (() => {})}
        onCancel={() => setModal(null)}
      />

      {/* ── Main Grid ── */}
      <div className="responsive-grid-custom" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* LDR Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
            <div>
              <h3 style={{ fontSize: '20px', marginBottom: '4px' }}>Sensitivitas LDR</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Kalibrasi sensor cahaya (Light Dependent Resistor)</p>
            </div>
            <div style={{ width: '48px', height: '48px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sun size={24} color="var(--accent-blue)" />
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>Batas Cahaya Lingkungan</span>
              <span style={{ fontSize: '26px', fontWeight: '800', color: 'var(--accent-blue)' }}>
                {settings.lux_threshold}{' '}
                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>lux</span>
              </span>
            </div>
            <input
              type="range"
              className="range-slider"
              min="0"
              max="500"
              value={settings.lux_threshold}
              onChange={e => handleSliderChange(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              <span>GELAP (0 lux)</span>
              <span>SINAR MATAHARI (500 lux)</span>
            </div>
          </div>

          {/* Number Input */}
          <div style={{ marginTop: 'auto' }}>
            <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              INPUT MANUAL NILAI LUX
            </label>
            <input
              type="number"
              className={`form-input${inputError ? ' is-error' : ''}`}
              value={rawInput}
              min="0"
              max="500"
              onChange={e => handleInputChange(e.target.value)}
              style={{ padding: '12px', fontSize: '16px' }}
              placeholder="0 – 500 lux"
            />
            {inputError && (
              <p className="field-error-text" style={{ fontSize: '12px', color: 'var(--accent-red)', marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <AlertCircle size={12} /> {inputError}
              </p>
            )}
          </div>
        </div>

        {/* Threshold Panel */}
        <div className="card" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: 'white', padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', marginBottom: '24px', width: 'fit-content' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#86efac' }} />
            SISTEM AKTIF
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '12px' }}>Parameter Tersimpan</h2>
          <p style={{ color: '#bfdbfe', lineHeight: '1.6', fontSize: '14px' }}>
            Sistem IoT (ESP32) akan menggunakan batas lux ini untuk menentukan kapan lingkungan cukup gelap untuk mengaktifkan lampu.
          </p>
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '8px' }}>PRATINJAU AMBANG BATAS</div>
            <div style={{ fontSize: '13px', color: 'white' }}>
              Lampu diprioritaskan menyala jika mendeteksi objek <strong>(jarak &lt; 3 cm)</strong> dan intensitas lingkungan <strong>&lt; {settings.lux_threshold} lux</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delay Ultrasonik Card (Slider) ── */}
      <div className="card" style={{ padding: '32px', marginBottom: '32px', background: '#f8fafc', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
          <div style={{ width: '52px', height: '52px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
            <Timer size={26} color={getDelayColor(settings.pir_delay)} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Delay Ultrasonik</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Waktu tunggu setelah objek tidak terdeteksi sebelum lampu kembali ke mode redup (40%)
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '32px', fontWeight: '800', color: getDelayColor(settings.pir_delay) }}>
              {settings.pir_delay}
              <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)', marginLeft: '4px' }}>detik</span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: getDelayColor(settings.pir_delay), letterSpacing: '0.5px' }}>
              {getDelayLabel(settings.pir_delay).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Slider */}
        <div style={{ padding: '0 8px' }}>
          <input
            type="range"
            className="range-slider"
            min="1"
            max="60"
            value={settings.pir_delay}
            onChange={e => setSettings(s => ({ ...s, pir_delay: parseInt(e.target.value) }))}
            style={{ accentColor: getDelayColor(settings.pir_delay) }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            <span>1 detik (Sangat Cepat)</span>
            <span>60 detik (Sangat Lama)</span>
          </div>
        </div>

        {/* Quick presets */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {[3, 5, 10, 15, 30, 45].map(val => (
            <button
              key={val}
              onClick={() => setSettings(s => ({ ...s, pir_delay: val }))}
              style={{
                padding: '8px 16px', borderRadius: '8px', border: settings.pir_delay === val ? `2px solid ${getDelayColor(val)}` : '1px solid var(--border-color)',
                background: settings.pir_delay === val ? `${getDelayColor(val)}15` : 'white',
                color: settings.pir_delay === val ? getDelayColor(val) : 'var(--text-secondary)',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              {val}s
            </button>
          ))}
        </div>
      </div>

      {/* ── Formula & Penjelasan Perhitungan ── */}
      <div className="card" style={{ marginBottom: '32px', padding: '32px', background: '#f8fafc', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GitBranch size={20} color="var(--accent-blue)" /> Rumus & Logika Pengambilan Keputusan
        </h3>

        {/* Decision Flow */}
        <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-blue)', marginBottom: '12px', letterSpacing: '0.5px' }}>ALUR KEPUTUSAN LAMPU</div>
            <div style={{ fontSize: '13px', lineHeight: '2.2', fontFamily: 'monospace' }}>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>1</span> Baca sensor LDR &rarr; <strong>Nilai Lux</strong></div>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>2</span> <strong>Jika Lux &lt; {settings.lux_threshold}</strong> &rarr; Lingkungan GELAP</div>
              <div style={{ paddingLeft: '20px' }}>&rarr; Baca sensor Ultrasonik &rarr; <strong>Jarak (cm)</strong></div>
              <div style={{ paddingLeft: '20px' }}>&rarr; <strong>Jika jarak &lt; 3 cm</strong> &rarr; Ada orang &rarr; PWM = <span style={{ color: '#16a34a', fontWeight: '700' }}>255 (100%)</span></div>
              <div style={{ paddingLeft: '20px' }}>&rarr; <strong>Jika jarak ≥ 3 cm</strong> &rarr; Tidak ada orang &rarr; PWM = <span style={{ color: '#d97706', fontWeight: '700' }}>102 (40%)</span></div>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>3</span> <strong>Jika Lux ≥ {settings.lux_threshold}</strong> &rarr; Lingkungan TERANG</div>
              <div style={{ paddingLeft: '20px' }}>&rarr; PWM = <span style={{ color: '#dc2626', fontWeight: '700' }}>0 (Mati)</span> &mdash; Hemat energi</div>
            </div>
          </div>

          <div style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-green)', marginBottom: '12px', letterSpacing: '0.5px' }}>PARAMETER YANG DIGUNAKAN</div>
            <div style={{ fontSize: '13px', lineHeight: '2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Batas Cahaya (Lux Threshold)</span>
                <strong style={{ color: 'var(--accent-blue)' }}>{settings.lux_threshold} lux</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Jarak Deteksi Ultrasonik</span>
                <strong style={{ color: '#8b5cf6' }}>{'< 3 cm'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Delay Setelah Objek Pergi</span>
                <strong style={{ color: getDelayColor(settings.pir_delay) }}>{settings.pir_delay} detik</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>PWM Terang Penuh (ada orang)</span>
                <strong>255 / 255 (100%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>PWM Redup (tidak ada orang)</span>
                <strong>102 / 255 (≈40%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>PWM Mati (siang / terang)</span>
                <strong>0 / 255 (0%)</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Formula Section */}
        <div style={{ padding: '20px', background: '#1e3a8a', borderRadius: '12px', color: 'white', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#93c5fd', marginBottom: '12px', letterSpacing: '0.5px' }}>RUMUS PENENTUAN KONDISI LAMPU</div>
          <div style={{ fontFamily: 'monospace', fontSize: '14px', lineHeight: '2.2' }}>
            <div><strong style={{ color: '#86efac' }}>NYALA_PENUH</strong> = (LDR_Lux &lt; <span style={{ color: '#fbbf24' }}>{settings.lux_threshold}</span>) ∧ (Jarak_Ultrasonik &lt; <span style={{ color: '#fbbf24' }}>3 cm</span>)</div>
            <div><strong style={{ color: '#fbbf24' }}>REDUP_40%</strong>&nbsp;&nbsp;&nbsp; = (LDR_Lux &lt; <span style={{ color: '#fbbf24' }}>{settings.lux_threshold}</span>) ∧ (Jarak_Ultrasonik ≥ <span style={{ color: '#fbbf24' }}>3 cm</span>)</div>
            <div><strong style={{ color: '#f87171' }}>MATI</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = (LDR_Lux ≥ <span style={{ color: '#fbbf24' }}>{settings.lux_threshold}</span>)</div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#bfdbfe' }}>
            Dimana: LDR_Lux = pembacaan sensor cahaya (0–500 lux), Jarak = sensor ultrasonik HC-SR04 (cm)
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" style={{ padding: '12px 24px' }} onClick={handleReset}>
          <RotateCcw size={16} /> Kembalikan ke Awal
        </button>
        <button
          className="btn btn-primary"
          style={{ padding: '12px 28px' }}
          onClick={handleSaveClick}
          disabled={saving || !!inputError}
        >
          <Save size={16} />
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </button>
      </div>
    </div>
  )
}
