import { useState, useEffect, useCallback } from 'react'
import { Wifi, Lightbulb, User, Activity, AlertTriangle, Zap, Gauge } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

// ─── Helpers ────────────────────────────────────────────────
function getKondisiStyle(kondisi) {
  if (!kondisi) return {}
  const k = kondisi.toUpperCase()
  if (k.includes('RUSAK'))   return { background: '#fef2f2', color: '#dc2626' }
  if (k.includes('NORMAL'))  return { background: '#f0fdf4', color: '#16a34a' }
  if (k.includes('TUNGGU'))  return { background: '#fffbeb', color: '#d97706' }
  return { background: '#f3f4f6', color: '#4b5563' }
}

export default function Dashboard({ token, onUnauthorized }) {
  const [summary, setSummary] = useState(null)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')

      const [summaryData, deviceData] = await Promise.all([
        apiFetch('/api/dashboard/summary', { token }),
        apiFetch('/api/device/latest', { token }),
      ])

      setSummary(summaryData)
      setDevices(Array.isArray(deviceData) ? deviceData : [])
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Dashboard fetch error:', error)

      if (error.status === 401) {
        onUnauthorized?.()
        return
      }

      setError(getErrorMessage(error, 'Gagal memuat data dashboard.'))
    } finally {
      setLoading(false)
    }
  }, [token, onUnauthorized])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading && !summary) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Menghubungkan ke sistem...</p>
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="card empty-state">
        <AlertTriangle size={40} color="var(--accent-red)" />
        <h3>Dashboard belum bisa dimuat</h3>
        <p>{error}</p>
      </div>
    )
  }

  const activeUnits    = summary?.active_devices  || 0
  const totalUnits     = summary?.total_devices    || 0
  const faultyUnits    = summary?.faulty_devices   || 0
  const lampuMenyala   = summary?.lampu_menyala    || 0
  const avgLux         = summary?.avg_lux          || 0
  const avgCurrent     = summary?.avg_current      || 0

  // Efficiency: ratio of lights off (energy saving)
  const eff = activeUnits > 0
    ? Math.round(((activeUnits - lampuMenyala) / activeUnits) * 100)
    : 0

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--accent-blue)' }}>Real-time Dashboard</span>
            <span className="status-badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>
              <Activity size={12} />
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString('id-ID')}` : 'SYNCING...'}
            </span>
          </div>
          <div className="page-title-wrap">
            <h4>OVERVIEW</h4>
            <h1>Campus Sentinel</h1>
          </div>
        </div>

        <div className="header-actions">
          <div className="kpi-box">
            <div className="kpi-box-label">ACTIVE UNITS</div>
            <div className="kpi-box-val">{activeUnits}/{totalUnits || activeUnits}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-box-label">FAULTY</div>
            <div className="kpi-box-val" style={{ color: faultyUnits > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
              {faultyUnits} Unit{faultyUnits !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="kpi-box">
            <div className="kpi-box-label">EFFICIENCY</div>
            <div className="kpi-box-val green">{eff}% Energy</div>
          </div>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="summary-strip">
        {error && (
          <div className="summary-item" style={{ color: 'var(--accent-red)' }}>
            <AlertTriangle size={16} color="var(--accent-red)" />
            <span>{error}</span>
          </div>
        )}
        <div className="summary-item">
          <Lightbulb size={16} color="var(--accent-green)" />
          <span><strong>{lampuMenyala}</strong> Lampu Menyala</span>
        </div>
        <div className="summary-item">
          <Lightbulb size={16} color="var(--text-muted)" />
          <span><strong>{summary?.lampu_mati || 0}</strong> Lampu Mati</span>
        </div>
        <div className="summary-item">
          <Gauge size={16} color="var(--accent-blue)" />
          <span>Avg Lux: <strong>{avgLux} lx</strong></span>
        </div>
        <div className="summary-item">
          <Zap size={16} color="var(--accent-orange)" />
          <span>Avg Arus: <strong>{avgCurrent} mA</strong></span>
        </div>
      </div>

      {/* ── Zone Cards Grid ── */}
      <div className="grid-cols-4">
        {devices.length === 0 ? (
          <div className="card empty-state" style={{ gridColumn: 'span 4' }}>
            <Wifi size={48} color="var(--text-muted)" />
            <h3>Tidak ada device terdeteksi</h3>
            <p>Nyalakan ESP32 / Simulator untuk melihat data real-time.</p>
          </div>
        ) : devices.map((dev, idx) => {
          const d          = dev.latest_data
          const isOff      = d.powerLampu === 0
          const isRedup    = d.powerLampu > 0 && d.powerLampu < 200
          const isFull     = d.powerLampu >= 200
          const stateLabel = isOff ? 'OFF' : (isRedup ? 'REDUP' : 'TERANG')
          const powerPct   = Math.min(100, Math.round((d.powerLampu / 255) * 100))
          const isFaulty   = d.is_faulty

          return (
            <div
              key={`${dev.device_id}-${dev.zone}-${idx}`}
              className={`card zone-card ${isFaulty ? 'zone-faulty' : ''}`}
            >
              {/* Header */}
              <div className="zc-header">
                <div>
                  <div className="zc-id">ZONE {dev.zone} • {dev.device_id}</div>
                  <div className="zc-name">Area {dev.device_id} Z-{dev.zone}</div>
                </div>
                <div className={`zc-icon ${!isOff ? 'on' : 'off'}`}>
                  <Lightbulb size={20} />
                </div>
              </div>

              {/* Faulty Badge */}
              {isFaulty && (
                <div className="faulty-badge">
                  <AlertTriangle size={12} /> KERUSAKAN TERDETEKSI
                </div>
              )}

              {/* State + Progress */}
              <div>
                <div className="zc-state-row">
                  <span className="zc-state-label">STATE:</span>
                  <span className={`zc-state-badge ${stateLabel}`}>{stateLabel}</span>
                  <span className="zc-power-pct">{powerPct}%</span>
                </div>
                <div className="zc-progress-bg">
                  <div
                    className="zc-progress-fill"
                    style={{
                      width: `${powerPct}%`,
                      background: isOff ? '#d1d5db' : isFaulty ? '#ef4444' : isFull ? 'var(--accent-blue)' : '#60a5fa'
                    }}
                  />
                </div>
              </div>

              {/* Kondisi & Trigger */}
              <div className="zc-kondisi-row">
                <span className="kondisi-chip" style={getKondisiStyle(d.kondisi)}>
                  {d.kondisi || '-'}
                </span>
                <span className="trigger-chip">{d.trigger || '-'}</span>
              </div>

              {/* Sensor Metrics */}
              <div className="zc-metrics">
                <div className="zc-metric-box">
                  <div className="zc-metric-label">LDR LUX</div>
                  <div className="zc-metric-val">{d.lux != null ? `${d.lux} lx` : '-'}</div>
                </div>
                <div className="zc-metric-box">
                  <div className="zc-metric-label">JARAK</div>
                  <div className="zc-metric-val">{d.jarak != null ? `${d.jarak} cm` : '-'}</div>
                </div>
                <div className="zc-metric-box">
                  <div className="zc-metric-label">ARUS</div>
                  <div className={`zc-metric-val ${isFaulty ? 'faulty' : ''}`}>
                    {d.current != null ? `${d.current} mA` : '-'}
                  </div>
                </div>
              </div>

              {/* Presence Indicator */}
              <div className="zc-presence">
                <User size={13} color={d.sedangAdaOrang ? 'var(--accent-green)' : 'var(--text-muted)'} />
                <span style={{ color: d.sedangAdaOrang ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 600, fontSize: '12px' }}>
                  {d.sedangAdaOrang ? 'Objek Terdeteksi' : 'Tidak Ada Objek'}
                </span>
                {d.masihMasaTunggu && (
                  <span className="masa-tunggu-chip">MASA TUNGGU</span>
                )}
              </div>

              {/* Sensor Status Row */}
              <div className="zc-sensor-status">
                {['ldr', 'ultrasonic', 'ina219'].map(s => (
                  <span
                    key={s}
                    className={`sensor-chip ${d.sensor_status?.[s] === 'ERROR' ? 'error' : 'ok'}`}
                  >
                    {s.toUpperCase()}: {d.sensor_status?.[s] || 'OK'}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
