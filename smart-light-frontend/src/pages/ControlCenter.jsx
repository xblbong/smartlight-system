import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, AlertTriangle, CheckCircle2, Lightbulb, RefreshCw, Power } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

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

  const handleControl = async (deviceId, zone, action) => {
    const key = `${deviceId}-${zone}`
    setPending(prev => ({ ...prev, [key]: action }))
    try {
      await apiFetch('/api/device/control', {
        method: 'POST',
        token,
        body: { device_id: deviceId, zone, action },
      })
      addToast(`✓ Perintah ${action} dikirim ke Zone ${zone} (${deviceId})`, 'success')
      setTimeout(fetchDevices, 1500)
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized?.()
        return
      }

      addToast(getErrorMessage(error, `Gagal mengirim perintah ${action}.`), 'error')
    } finally {
      setPending(prev => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
    }
  }

  const handleMasterControl = async (action) => {
    if (!window.confirm(`Yakin ingin ${action === 'ON' ? 'menyalakan' : 'mematikan'} SEMUA zona?`)) return
    const results = await Promise.allSettled(
      devices.map(dev => handleControl(dev.device_id, dev.zone, action))
    )
    const ok = results.filter(r => r.status === 'fulfilled').length
    addToast(`Master ${action}: ${ok}/${devices.length} zona berhasil`, ok === devices.length ? 'success' : 'error')
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
            <h4>SYSTEM SENTINEL V4.0</h4>
            <h1>Manual Control Center</h1>
          </div>
          <p style={{ maxWidth: '600px', color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '8px' }}>
            Override langsung sistem pencahayaan adaptif. Gunakan untuk maintenance,
            darurat, atau event kampus. Override manual berlaku 4 jam.
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={fetchDevices}
          style={{ alignSelf: 'flex-start', gap: '8px' }}
        >
          <RefreshCw size={14} /> Refresh
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

            return (
              <div
                key={idx}
                className={`card control-card ${isFaulty ? 'zone-faulty' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className={`ctrl-zone-icon ${isOn ? 'on' : 'off'}`}>
                    <MapPin size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '4px' }}>
                      {dev.zone_name || `Lokasi ${idx + 1}`}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Zone {dev.zone} • {dev.device_id}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={`control-status-chip ${isOn ? 'on' : 'off'}`}>
                        <Lightbulb size={11} /> {d.kondisi || (isOn ? 'NYALA' : 'MATI')}
                      </span>
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

                <div className="control-btns">
                  <button
                    className="btn btn-primary"
                    disabled={isPend}
                    onClick={() => handleControl(dev.device_id, dev.zone, 'ON')}
                    style={{ minWidth: '100px' }}
                  >
                    {isPend && pending[key] === 'ON' ? <><div className="spinner-sm" /> Sending...</> : 'FORCE ON'}
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={isPend}
                    onClick={() => handleControl(dev.device_id, dev.zone, 'OFF')}
                    style={{ minWidth: '100px', background: '#f3f4f6' }}
                  >
                    {isPend && pending[key] === 'OFF' ? <><div className="spinner-sm" /> Sending...</> : 'FORCE OFF'}
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
            <h2 style={{ fontSize: '22px', marginBottom: '10px' }}>Master Lockdown</h2>
            <p style={{ fontSize: '13px', color: '#93c5fd', marginBottom: '20px', lineHeight: '1.6' }}>
              Override serentak seluruh zona kampus. Gunakan hanya dalam situasi keamanan prioritas tinggi.
            </p>
            <button
              className="btn"
              style={{ background: 'white', color: 'var(--sidebar-bg)', width: '100%', marginBottom: '10px', fontWeight: '700' }}
              onClick={() => handleMasterControl('ON')}
            >
              ACTIVATE FULL ILLUMINATION
            </button>
            <button
              className="btn"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', width: '100%', border: '1px solid rgba(255,255,255,0.2)' }}
              onClick={() => handleMasterControl('OFF')}
            >
              GLOBAL SHUTDOWN
            </button>
          </div>

          {/* Override Summary */}
          <div className="card">
            <h4 style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
              OVERRIDE SUMMARY
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
