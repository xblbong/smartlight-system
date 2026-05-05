import { useState, useEffect } from 'react'
import { Sun, Timer, Save, RotateCcw, Check, GitBranch, Settings, Link2, AlertCircle } from 'lucide-react'
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
  const [settings, setSettings] = useState({ ldr_sensitivity: 20, pir_delay: 15 })
  const [rawInput, setRawInput] = useState('20')
  const [inputError, setInputError] = useState('')
  const [saving, setSaving] = useState(false)
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
      setInputError('Input harus angka antara 0–500 lux')
    } else if (n < 0 || n > 500) {
      setInputError('Nilai harus antara 0 dan 500 lux')
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
    setSettings({ ldr_sensitivity: 20, pir_delay: 15 })
    setRawInput('20')
    setInputError('')
  }

  // Efficiency estimate based on threshold (outdoor: 20-500 lux range)
  const effPct = Math.round(60 + (settings.ldr_sensitivity / 500) * 30)

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div className="page-title-wrap">
          <h4>PENGATURAN SISTEM</h4>
          <h1>Konfigurasi Thresholds</h1>
          <p style={{ maxWidth: '600px', color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '8px' }}>
            Atur parameter sensor untuk sistem pencahayaan kampus.
            Sesuaikan tingkat sensitivitas deteksi cahaya dan timer kehadiran objek.
          </p>
        </div>
      </div>

      <InlineAlert type={alertType} message={alertMsg} />

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
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
                {settings.ldr_sensitivity}{' '}
                <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>lux</span>
              </span>
            </div>
            <input
              type="range"
              className="range-slider"
              min="0"
              max="500"
              value={settings.ldr_sensitivity}
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
              Lampu diprioritaskan menyala jika mendeteksi objek <strong>(jarak &lt; 5 cm)</strong> dan intensitas lingkungan <strong>&lt; {settings.ldr_sensitivity} lux</strong>
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
            <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>Delay Ultrasonik</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Waktu tunggu setelah objek tidak terdeteksi sebelum lampu kembali ke mode redup (40%)
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
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>DETIK</div>
            </div>
            <button
              className="btn btn-outline"
              style={{ border: 'none', padding: '8px 18px', fontSize: '20px', lineHeight: 1 }}
              onClick={() => setSettings(s => ({ ...s, pir_delay: Math.min(5, s.pir_delay + 1) }))}
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

      {/* ── Formula & Penjelasan Perhitungan ── */}
      <div className="card" style={{ marginBottom: '32px', padding: '32px', background: '#f8fafc', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GitBranch size={20} color="var(--accent-blue)" /> Rumus & Logika Pengambilan Keputusan
        </h3>

        {/* Decision Flow */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-blue)', marginBottom: '12px', letterSpacing: '0.5px' }}>ALUR KEPUTUSAN LAMPU</div>
            <div style={{ fontSize: '13px', lineHeight: '2.2', fontFamily: 'monospace' }}>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>1</span> Baca sensor LDR &rarr; <strong>Nilai Lux</strong></div>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>2</span> <strong>Jika Lux &lt; {settings.ldr_sensitivity}</strong> &rarr; Lingkungan GELAP</div>
              <div style={{ paddingLeft: '20px' }}>&rarr; Baca sensor Ultrasonik &rarr; <strong>Jarak (cm)</strong></div>
              <div style={{ paddingLeft: '20px' }}>&rarr; <strong>Jika jarak &lt; 30 cm</strong> &rarr; Ada orang &rarr; PWM = <span style={{ color: '#16a34a', fontWeight: '700' }}>255 (100%)</span></div>
              <div style={{ paddingLeft: '20px' }}>&rarr; <strong>Jika jarak &ge; 30 cm</strong> &rarr; Tidak ada orang &rarr; PWM = <span style={{ color: '#d97706', fontWeight: '700' }}>100 (40%)</span></div>
              <div><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-blue)', color: 'white', fontSize: '10px', fontWeight: '700', marginRight: '6px' }}>3</span> <strong>Jika Lux &ge; {settings.ldr_sensitivity}</strong> &rarr; Lingkungan TERANG</div>
              <div style={{ paddingLeft: '20px' }}>&rarr; PWM = <span style={{ color: '#dc2626', fontWeight: '700' }}>0 (Mati)</span> &mdash; Hemat energi</div>
            </div>
          </div>

          <div style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-green)', marginBottom: '12px', letterSpacing: '0.5px' }}>PARAMETER YANG DIGUNAKAN</div>
            <div style={{ fontSize: '13px', lineHeight: '2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Batas Cahaya (LDR Threshold)</span>
                <strong style={{ color: 'var(--accent-blue)' }}>{settings.ldr_sensitivity} lux</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Jarak Deteksi Ultrasonik</span>
                <strong>{'< 30 cm'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>Delay Setelah Objek Pergi</span>
                <strong style={{ color: 'var(--accent-green)' }}>{settings.pir_delay} detik</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>PWM Terang Penuh (ada orang)</span>
                <strong>255 / 255 (100%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>PWM Redup (tidak ada orang)</span>
                <strong>100 / 255 (≈40%)</strong>
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
            <div><strong style={{ color: '#86efac' }}>NYALA_PENUH</strong> = (LDR_Lux &lt; <span style={{ color: '#fbbf24' }}>{settings.ldr_sensitivity}</span>) ∧ (Jarak_Ultrasonik &lt; <span style={{ color: '#fbbf24' }}>30 cm</span>)</div>
            <div><strong style={{ color: '#fbbf24' }}>REDUP_40%</strong>&nbsp;&nbsp;&nbsp; = (LDR_Lux &lt; <span style={{ color: '#fbbf24' }}>{settings.ldr_sensitivity}</span>) ∧ (Jarak_Ultrasonik ≥ <span style={{ color: '#fbbf24' }}>30 cm</span>)</div>
            <div><strong style={{ color: '#f87171' }}>MATI</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; = (LDR_Lux ≥ <span style={{ color: '#fbbf24' }}>{settings.ldr_sensitivity}</span>)</div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#bfdbfe' }}>
            Dimana: LDR_Lux = pembacaan sensor cahaya (0–1024 lux), Jarak = sensor ultrasonik HC-SR04 (cm)
          </div>
        </div>

        {/* Connection to other modules */}
        <div style={{ padding: '16px 20px', background: '#eff6ff', borderRadius: '10px', fontSize: '13px', lineHeight: '1.8', color: '#1e40af' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Link2 size={16} /> <strong>Koneksi ke Modul Lain:</strong></span>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
            <li><strong>Dashboard:</strong> Menampilkan LDR Threshold aktif dan status setiap zona (nyala/redup/mati) berdasarkan parameter ini</li>
            <li><strong>Control Center:</strong> Override manual bisa memaksa lampu ON/OFF melewati threshold ini</li>
            <li><strong>Analytics:</strong> Data log sensor mencatat setiap pembacaan lux vs threshold untuk audit efisiensi</li>
            <li><strong>Simulator (ESP32):</strong> Mengambil nilai threshold ini setiap 30 detik via API <code>/api/settings</code></li>
          </ul>
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
          onClick={handleSave}
          disabled={saving || !!inputError}
        >
          <Save size={16} />
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </button>
      </div>
    </div>
  )
}
