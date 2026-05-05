import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, AlertTriangle, CheckCircle2, Lightbulb, RefreshCw, Power } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

const ZONE_NAMES = {
  'A': 'Bundaran UB', 'B': 'Gerbang Rektorat', 'C': 'Jalur Fak. Vokasi',
  'D': 'Taman Graha', 'E': 'Parkir Utama',
}

// Jumlah lampu per zona
const ZONE_LAMPS = {
  'A': 8, 'B': 6, 'C': 4, 'D': 6, 'E': 4,
}

// ─── Toast Notification ──────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
          {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

export default function ControlCenter({ token, onUnauthorized }) {
  const [devices, setDevices]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [toasts, setToasts]     = useState([])
  const [pending, setPending]   = useState({}) // { 'deviceId-zone': 'ON'|'OFF' }
  const toastRef                = useRef(0)

  const addToast = (message, type = 'success') => {
    const id = ++toastRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const fetchDevices = useCallback(async () => {
    try {
      const data = await apiFetch('/api/device/latest', { token })
      setDevices(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('ControlCenter fetch error:', error)

      if (error.status === 401) {
        onUnauthorized?.()
        return
      }

      addToast(getErrorMessage(error, 'Tidak dapat memuat device dari server backend.'), 'error')
    } finally {
      setLoading(false)
    }
  }, [token, onUnauthorized])

  useEffect(() => {
    fetchDevices()
    const id = setInterval(fetchDevices, 8000)
    return () => clearInterval(id)
  }, [fetchDevices])

  const handleControl = async (deviceId, zone, action, silent = false) => {
    const key = `${deviceId}-${zone}`
    setPending(prev => ({ ...prev, [key]: action }))
    try {
      await apiFetch('/api/device/control', {
        method: 'POST',
        token,
        body: { device_id: deviceId, zone, action },
      })
      if (!silent) {
        addToast(`✓ Perintah ${action} dikirim ke Zone ${zone} (${deviceId})`, 'success')
      }
      setTimeout(fetchDevices, 1500)
      return true
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized?.()
        return false
      }

      if (!silent) {
        addToast(getErrorMessage(error, `Gagal mengirim perintah ${action}.`), 'error')
      }
      return false
    } finally {
      setPending(prev => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
    }
  }

  const handleMasterControl = async (action) => {
    const actionText = action === 'ON' ? 'menyalakan' : action === 'OFF' ? 'mematikan' : 'mengembalikan ke otomatis untuk'
    if (!window.confirm(`Yakin ingin ${actionText} SEMUA zona?`)) return
    const results = await Promise.all(
      devices.map(dev => handleControl(dev.device_id, dev.zone, action, true))
    )
    const ok = results.filter(Boolean).length
    addToast(`Master ${action}: ${ok}/${devices.length} zona berhasil`, ok === devices.length ? 'success' : 'error')
  }

  // Deteksi offline: jika data terakhir lebih dari 3 menit yang lalu
  const isOffline = (latestData) => {
    if (!latestData) return false
    const ts = latestData.timestamp || latestData.cache_updated_at
    if (!ts) return false
    const tsStr = String(ts)
    const parsed = tsStr.includes('Z') || tsStr.includes('+') ? new Date(tsStr) : new Date(tsStr + '+07:00')
    const diff = Date.now() - parsed.getTime()
    return diff > 3 * 60 * 1000
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Memuat Control Center...</p>
      </div>
    )
  }

  const faultyCount   = devices.filter(d => d.latest_data?.is_faulty).length
  const onCount       = devices.filter(d => d.latest_data?.powerLampu > 0).length
  const offCount      = devices.length - onCount

  return (
    <div>
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <div className="page-title-wrap">
            <h4>PUSAT KENDALI</h4>
            <h1>Kontrol Manual Zona</h1>
          </div>
          <p style={{ maxWidth: '600px', color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '8px' }}>
            Kontrol langsung sistem pencahayaan adaptif. Gunakan untuk pemeliharaan,
            keadaan darurat, atau acara kampus.
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={fetchDevices}
          style={{ alignSelf: 'flex-start', gap: '8px' }}
        >
          <RefreshCw size={14} /> Segarkan
        </button>
      </div>

      <div className="control-layout">
        {/* ── Left: Zone List ── */}
        <div className="control-list">
          {devices.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
              <Power size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <h3>Tidak ada device aktif</h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                Jalankan simulator IoT untuk melihat device.
              </p>
            </div>
          ) : devices.map((dev, idx) => {
            const d        = dev.latest_data
            const key      = `${dev.device_id}-${dev.zone}`
            const isPend   = !!pending[key]
            const isOn     = d.powerLampu > 0
            const isFaulty = d.is_faulty
            const offline  = isOffline(d)

            return (
              <div
                key={idx}
                className={`card control-card ${isFaulty ? 'zone-faulty' : ''}`}
                style={offline ? { opacity: 0.55 } : {}}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className={`ctrl-zone-icon ${offline ? 'off' : isOn ? 'on' : 'off'}`}>
                    <MapPin size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '4px' }}>
                      {ZONE_NAMES[dev.zone] || `Zone ${dev.zone}`} — {dev.device_id}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {offline ? (
                        <span className="control-status-chip off" style={{ background: '#9ca3af', color: 'white' }}>
                          <AlertTriangle size={11} /> OFFLINE
                        </span>
                      ) : (
                        <span className={`control-status-chip ${isOn ? 'on' : 'off'}`}>
                          <Lightbulb size={11} /> {d.kondisi || (isOn ? 'NYALA' : 'MATI')}
                        </span>
                      )}
                      {isFaulty && (
                        <span className="control-status-chip faulty">
                          <AlertTriangle size={11} /> RUSAK
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        PWM: {d.powerLampu} | Arus: {d.current} mA | Lux: {d.lux} lx
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: isOn ? '#f0fdf4' : '#f3f4f6', borderRadius: '8px', fontSize: '12px', marginBottom: '4px' }}>
                  <Lightbulb size={13} color={isOn ? 'var(--accent-green)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: '600', color: isOn ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {isOn ? (ZONE_LAMPS[dev.zone] || 2) : 0} / {ZONE_LAMPS[dev.zone] || 2} lampu aktif
                  </span>
                  {d.kondisi && !d.kondisi.includes('MANUAL') && (
                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: 'var(--accent-green)', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>AUTO</span>
                  )}
                  {d.kondisi?.includes('MANUAL') && (
                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>MANUAL</span>
                  )}
                </div>

                <div className="control-btns">
                  <button
                    className="btn btn-primary"
                    disabled={isPend || (!offline && isOn && d.kondisi?.includes('MANUAL'))}
                    onClick={() => handleControl(dev.device_id, dev.zone, 'ON')}
                    style={{ minWidth: '100px', opacity: (!offline && isOn && d.kondisi?.includes('MANUAL')) ? 0.4 : 1 }}
                  >
                    {isPend && pending[key] === 'ON' ? <><div className="spinner-sm" /> Mengirim...</> : 'NYALAKAN'}
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={isPend || (!offline && !isOn && d.kondisi?.includes('MANUAL'))}
                    onClick={() => handleControl(dev.device_id, dev.zone, 'OFF')}
                    style={{ minWidth: '100px', background: '#f3f4f6', opacity: (!offline && !isOn && d.kondisi?.includes('MANUAL')) ? 0.4 : 1 }}
                  >
                    {isPend && pending[key] === 'OFF' ? <><div className="spinner-sm" /> Mengirim...</> : 'MATIKAN'}
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={isPend || (!d.kondisi?.includes('MANUAL'))}
                    onClick={() => handleControl(dev.device_id, dev.zone, 'AUTO')}
                    style={{ minWidth: '100px', background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd', opacity: (!d.kondisi?.includes('MANUAL')) ? 0.4 : 1 }}
                  >
                    {isPend && pending[key] === 'AUTO' ? <><div className="spinner-sm" /> Mengirim...</> : 'AUTO'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Right: Summary + Master ── */}
        <div className="control-sidebar">
          {/* Master Lockdown */}
          <div className="card" style={{ background: 'var(--sidebar-bg)', color: 'white', border: 'none' }}>
            <AlertTriangle size={28} style={{ marginBottom: '12px', color: '#fbbf24' }} />
            <h2 style={{ fontSize: '22px', marginBottom: '10px' }}>Kontrol Utama</h2>
            <p style={{ fontSize: '13px', color: '#93c5fd', marginBottom: '20px', lineHeight: '1.6' }}>
              Nyalakan atau matikan semua lampu serentak. Gunakan saat situasi darurat atau pemeliharaan.
            </p>
            <button
              className="btn"
              style={{ background: 'white', color: 'var(--sidebar-bg)', width: '100%', marginBottom: '10px', fontWeight: '700' }}
              onClick={() => handleMasterControl('ON')}
            >
              NYALAKAN SEMUA
            </button>
            <button
              className="btn"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', width: '100%', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '10px' }}
              onClick={() => handleMasterControl('OFF')}
            >
              MATIKAN SEMUA
            </button>
            <button
              className="btn"
              style={{ background: '#e0f2fe', color: '#0369a1', width: '100%', border: 'none', fontWeight: '600' }}
              onClick={() => handleMasterControl('AUTO')}
            >
              KEMBALIKAN KE AUTO
            </button>
          </div>

          {/* Override Summary */}
          <div className="card">
            <h4 style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
              RINGKASAN STATUS
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Lampu Menyala',   val: onCount,     color: 'var(--accent-green)' },
                { label: 'Lampu Mati',      val: offCount,    color: 'var(--accent-blue)' },
                { label: 'Offline/Fault',   val: faultyCount, color: 'var(--accent-red)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color }} />
                    {row.label}
                  </span>
                  <span>{row.val} Zona</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700' }}>Total Zona</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-blue)' }}>
                {devices.length}
              </span>
            </div>
            <div className="zc-progress-bg">
              <div className="zc-progress-fill" style={{ width: `${devices.length > 0 ? (onCount / devices.length) * 100 : 0}%`, background: 'var(--sidebar-bg)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {devices.length > 0 ? Math.round((onCount / devices.length) * 100) : 0}% zona aktif
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
