import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { FileText, Clock, Wifi, AlertTriangle, Download, RefreshCw, Table2 } from 'lucide-react'
import { apiFetch, getErrorMessage } from '../lib/api'

// ─── Helpers ────────────────────────────────────────────────────────
function formatTimestamp(ts) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  } catch { return ts }
}

// ─── Export to CSV (dibuka di Excel) ───────────────────────────────
function exportToExcel(data, filename = 'sensor_log.csv') {
  if (!data || data.length === 0) {
    alert('Tidak ada data untuk diekspor.')
    return
  }

  const headers = [
    'Waktu', 'Device ID', 'Zona', 'Lux (lx)', 'Jarak (cm)',
    'Arus (mA)', 'Voltage (V)', 'Power (PWM)', 'Kondisi', 'Trigger',
    'Ada Orang', 'Masa Tunggu', 'Tombol', 'LDR Status', 'Ultrasonic Status', 'INA219 Status'
  ]

  const rows = data.map(row => [
    formatTimestamp(row.timestamp || row.created_at),
    row.device_id || '',
    row.zone || '',
    parseFloat(row.lux || 0).toFixed(2),
    parseFloat(row.jarak || 0).toFixed(2),
    parseFloat(row.current || 0).toFixed(2),
    parseFloat(row.voltage || 0).toFixed(2),
    row.powerLampu || 0,
    row.kondisi || '',
    row.trigger || '',
    row.sedangAdaOrang ? 'Ya' : 'Tidak',
    row.masihMasaTunggu ? 'Ya' : 'Tidak',
    row.tombol ? 'Ya' : 'Tidak',
    row.ldr_status || 'OK',
    row.ultrasonic_status || 'OK',
    row.ina219_status || 'OK',
  ])

  // BOM untuk karakter UTF-8 agar Excel Indonesia membaca dengan benar
  const bom = '\uFEFF'
  const csvContent = bom + [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Export to PDF (via print window) ──────────────────────────────
function exportToPDF(data, summary, filterZone, filterDevice) {
  if (!data || data.length === 0) {
    alert('Tidak ada data untuk diekspor.')
    return
  }

  const now     = new Date().toLocaleString('id-ID')
  const title   = `Laporan Sensor Log Smart Lighting${filterZone ? ` — Zona ${filterZone}` : ''}${filterDevice ? ` — ${filterDevice}` : ''}`
  const rows    = data.slice(0, 200)

  const tableRows = rows.map((row, i) => {
    const isFaulty = parseFloat(row.current) < 10 && parseInt(row.powerLampu) > 0
    const bg = isFaulty ? '#FFF5F5' : i % 2 === 0 ? '#fff' : '#f8fafc'
    const kondisiColor = row.kondisi?.includes('RUSAK') ? '#dc2626'
      : row.kondisi?.includes('NORMAL') ? '#16a34a' : '#374151'

    return `
      <tr style="background:${bg}">
        <td>${i + 1}</td>
        <td>${formatTimestamp(row.timestamp || row.created_at)}</td>
        <td><strong>${row.device_id || ''}</strong></td>
        <td><span style="background:#eff6ff;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:11px">Zone ${row.zone || ''}</span></td>
        <td>${parseFloat(row.lux || 0).toFixed(1)}</td>
        <td>${parseFloat(row.jarak || 0).toFixed(1)}</td>
        <td style="color:${isFaulty ? '#dc2626' : 'inherit'};font-weight:${isFaulty ? '700' : '400'}">${parseFloat(row.current || 0).toFixed(1)}${isFaulty ? ' ⚠' : ''}</td>
        <td>${row.powerLampu || 0}</td>
        <td style="color:${kondisiColor};font-weight:600">${row.kondisi || '-'}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    .header { background: #1e3a8a; color: white; padding: 24px 32px; margin-bottom: 24px; }
    .header h1 { font-size: 20px; margin-bottom: 4px; }
    .header p  { font-size: 12px; opacity: 0.8; }
    .summary   { display: flex; gap: 16px; padding: 0 32px 20px; flex-wrap: wrap; }
    .sum-box   { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 20px; flex: 1; min-width: 140px; }
    .sum-box .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .sum-box .val   { font-size: 22px; font-weight: 800; color: #1e3a8a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #1e3a8a; color: white; padding: 10px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
    .footer { text-align: center; padding: 16px; font-size: 10px; color: #9ca3af; margin-top: 20px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>UB Adaptive — Smart Lighting System</h1>
    <p>${title}</p>
    <p>Dicetak pada: ${now} | Total data: ${data.length} entri</p>
  </div>
  <div class="summary">
    <div class="sum-box"><div class="label">Total Device</div><div class="val">${summary?.total_devices || '-'}</div></div>
    <div class="sum-box"><div class="label">Zona Aktif</div><div class="val">${summary?.active_devices || '-'}</div></div>
    <div class="sum-box"><div class="label">Lampu Menyala</div><div class="val">${summary?.lampu_menyala || '-'}</div></div>
    <div class="sum-box"><div class="label">Faulty</div><div class="val" style="color:#dc2626">${summary?.faulty_devices || 0}</div></div>
    <div class="sum-box"><div class="label">Avg Lux</div><div class="val">${summary?.avg_lux || '-'} lx</div></div>
    <div class="sum-box"><div class="label">Avg Arus</div><div class="val">${summary?.avg_current || '-'} mA</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Waktu</th><th>Device</th><th>Zona</th>
        <th>Lux</th><th>Jarak</th><th>Arus (mA)</th>
        <th>PWM</th><th>Kondisi</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Sistem Smart Lighting UB Adaptive — Laporan ini dibuat secara otomatis</div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1000,height=700')
  win.document.write(html)
  win.document.close()
}

// ────────────────────────────────────────────────────────────────────
export default function Analytics({ token, onUnauthorized }) {
  const [history, setHistory]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [summary, setSummary]         = useState(null)
  const [filterZone, setFilterZone]   = useState('')
  const [filterDevice, setFilterDevice] = useState('')
  const [exporting, setExporting]     = useState('')  // 'pdf' | 'excel' | ''
  const [error, setError]             = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')
      const params = new URLSearchParams({ limit: 500 })
      if (filterZone)   params.set('zone', filterZone)
      if (filterDevice) params.set('device_id', filterDevice)

      const [historyData, summaryData] = await Promise.all([
        apiFetch(`/api/device/history?${params}`, { token }),
        apiFetch('/api/dashboard/summary', { token }),
      ])

      setHistory(Array.isArray(historyData) ? historyData : [])
      setSummary(summaryData)
    } catch (error) {
      console.error('Analytics fetch error:', error)

      if (error.status === 401) {
        onUnauthorized?.()
        return
      }

      setError(getErrorMessage(error, 'Gagal memuat data analitik.'))
    } finally {
      setLoading(false)
    }
  }, [token, filterZone, filterDevice, onUnauthorized])

  useEffect(() => { fetchData() }, [fetchData])

  // Chart data (50 terbaru, urutan lama → baru)
  const chartData = history.slice(0, 50).reverse().map(log => ({
    name:    formatTimestamp(log.timestamp || log.created_at),
    lux:     parseFloat(log.lux) || 0,
    power:   parseInt(log.powerLampu) || 0,
    current: parseFloat(log.current) || 0,
  }))

  const zones = [...new Set(history.map(h => h.zone))].filter(Boolean).sort()
  const devs  = [...new Set(history.map(h => h.device_id))].filter(Boolean).sort()

  const handleExcelExport = () => {
    setExporting('excel')
    const ts       = new Date().toISOString().slice(0, 10)
    const zone_sfx = filterZone ? `_zone${filterZone}` : ''
    const dev_sfx  = filterDevice ? `_${filterDevice}` : ''
    exportToExcel(history, `sensor_log${zone_sfx}${dev_sfx}_${ts}.csv`)
    setTimeout(() => setExporting(''), 1200)
  }

  const handlePDFExport = () => {
    setExporting('pdf')
    exportToPDF(history, summary, filterZone, filterDevice)
    setTimeout(() => setExporting(''), 1200)
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: '28px' }}>
        <div>
          <div className="page-title-wrap">
            <h4>PERFORMANCE AUDIT</h4>
            <h1>Analytics &amp; Reports</h1>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <FileText size={13} /> Live Data ({history.length} entri tersimpan)
            </span>
            <span>Refresh: {new Date().toLocaleTimeString('id-ID')}</span>
            {error && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626' }}>
                <AlertTriangle size={13} /> {error}
              </span>
            )}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            className="btn btn-outline"
            onClick={handlePDFExport}
            disabled={exporting === 'pdf' || history.length === 0}
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
          >
            <Download size={14} />
            {exporting === 'pdf' ? 'Membuat PDF...' : 'Export PDF'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExcelExport}
            disabled={exporting === 'excel' || history.length === 0}
            style={{ background: '#166534' }}
          >
            <Table2 size={14} />
            {exporting === 'excel' ? 'Mengunduh...' : 'Export Excel (CSV)'}
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: '700', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>FILTER:</span>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: '140px', padding: '8px 12px', fontSize: '13px' }}
          value={filterZone}
          onChange={e => setFilterZone(e.target.value)}
        >
          <option value="">Semua Zona</option>
          {zones.map(z => <option key={z} value={z}>Zone {z}</option>)}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: '160px', padding: '8px 12px', fontSize: '13px' }}
          value={filterDevice}
          onChange={e => setFilterDevice(e.target.value)}
        >
          <option value="">Semua Device</option>
          {devs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(filterZone || filterDevice) && (
          <button
            className="btn btn-outline"
            style={{ padding: '8px 14px', fontSize: '12px' }}
            onClick={() => { setFilterZone(''); setFilterDevice('') }}
          >✕ Reset Filter</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
          Menampilkan {history.length} entri
        </span>
      </div>

      {/* ── KPI Summary ── */}
      <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Log',       val: history.length,                        color: '#eff6ff', icon: <FileText size={18} /> },
          { label: 'Avg Lux',         val: history.length ? `${(history.reduce((a, b) => a + parseFloat(b.lux || 0), 0) / history.length).toFixed(1)} lx` : '—', color: '#f0fdf4', icon: <Wifi size={18} /> },
          { label: 'Lampu Menyala',   val: summary?.lampu_menyala ?? '—',         color: '#fffbeb', icon: <Clock size={18} /> },
          { label: 'Faulty Devices',  val: summary?.faulty_devices ?? '—',        color: '#fef2f2', icon: <AlertTriangle size={18} /> },
        ].map(({ label, val, color, icon }) => (
          <div key={label} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '18px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px', marginBottom: '3px' }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: '20px', fontWeight: '800' }}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart + Efficiency ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '15px', marginBottom: '3px' }}>Tren Sensor — Lux &amp; Power</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>50 data terbaru</p>
            </div>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11px', fontWeight: '600' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }} /> Lux
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }} /> Power (PWM)
              </span>
            </div>
          </div>
          {loading ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              Belum ada data historis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLux" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent-blue)"  stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--accent-blue)"  stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent-green)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                <Area type="monotone" dataKey="lux"   stroke="var(--accent-blue)"  fill="url(#gLux)"   strokeWidth={2} name="Lux (lx)" />
                <Area type="monotone" dataKey="power" stroke="var(--accent-green)" fill="url(#gPower)" strokeWidth={2} name="Power (PWM)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Efficiency panel */}
        <div className="card" style={{ background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', color: '#94a3b8', marginBottom: '14px' }}>NET EFFICIENCY</h4>
          <div style={{ fontSize: '52px', fontWeight: '800', lineHeight: '1', marginBottom: '10px' }}>
            {summary
              ? `${Math.round(((summary.lampu_mati || 0) / Math.max(summary.active_devices || 1, 1)) * 100)}%`
              : '—'}
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: 'auto' }}>
            Rasio lampu mati vs total zona aktif. Semakin tinggi = lebih hemat energi.
          </p>
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Total Log Tersimpan</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#38bdf8' }}>{history.length}</span>
            </div>
            <div className="zc-progress-bg" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="zc-progress-fill" style={{ width: `${Math.min(100, (history.length / 500) * 100)}%`, background: 'var(--accent-green)' }} />
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px', letterSpacing: '0.5px', fontWeight: '700' }}>
              TARGET: 500 DATA POINTS
            </div>
          </div>
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', fontSize: '12px', color: '#94a3b8' }}>
            Device terhubung: <strong style={{ color: 'white' }}>{summary?.total_devices || 0}</strong> unit<br />
            Zona aktif: <strong style={{ color: 'white' }}>{summary?.active_devices || 0}</strong> zona
          </div>
        </div>
      </div>

      {/* ── History Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '15px' }}>Riwayat Sensor Log</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {history.length > 100 ? `Ditampilkan 100 dari ${history.length} (gunakan filter atau export untuk data lengkap)` : `${history.length} entri`}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.8px' }}>
                {['#', 'WAKTU', 'DEVICE', 'ZONA', 'LUX', 'JARAK', 'ARUS (mA)', 'PWM', 'KONDISI', 'TRIGGER'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada data log. Jalankan simulator IoT.</td></tr>
              ) : history.slice(0, 100).map((row, i) => {
                const isFaulty = parseFloat(row.current) < 10 && parseInt(row.powerLampu) > 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: isFaulty ? '#fff5f5' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatTimestamp(row.timestamp || row.created_at)}</td>
                    <td style={{ padding: '9px 14px', fontWeight: '600' }}>{row.device_id}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ background: '#eff6ff', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', fontSize: '10px' }}>
                        Zone {row.zone}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>{parseFloat(row.lux || 0).toFixed(1)}</td>
                    <td style={{ padding: '9px 14px' }}>{parseFloat(row.jarak || 0).toFixed(1)} cm</td>
                    <td style={{ padding: '9px 14px', color: isFaulty ? 'var(--accent-red)' : 'inherit', fontWeight: isFaulty ? '700' : '400' }}>
                      {parseFloat(row.current || 0).toFixed(1)}{isFaulty && ' ⚠'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>{row.powerLampu}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                        background: row.kondisi?.includes('RUSAK') ? '#fef2f2' : row.kondisi?.includes('NORMAL') ? '#dcfce7' : '#f3f4f6',
                        color: row.kondisi?.includes('RUSAK') ? '#dc2626' : row.kondisi?.includes('NORMAL') ? '#16a34a' : '#4b5563',
                      }}>
                        {row.kondisi || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', fontSize: '11px' }}>{row.trigger || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
