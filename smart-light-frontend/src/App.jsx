import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { LayoutDashboard, SlidersHorizontal, Activity, BarChart3, LogOut, Wifi } from 'lucide-react'
import Login from './Login'
import Dashboard from './pages/Dashboard'
import ControlCenter from './pages/ControlCenter'
import ThresholdSettings from './pages/ThresholdSettings'
import Analytics from './pages/Analytics'
import ubLogo from './assets/logo.png'
import './index.css'

// ─── Sidebar Component ───────────────────────────────────────
function Sidebar({ user, onLogout }) {
  const location = useLocation()
  const role = user?.role || 'admin_sarpras'

  const allNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin_sarpras', 'teknisi', 'pimpinan'] },
    { path: '/control', label: 'Control Center', icon: SlidersHorizontal, roles: ['admin_sarpras', 'teknisi'] },
    { path: '/settings', label: 'Threshold Settings', icon: Activity, roles: ['admin_sarpras'] },
    { path: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin_sarpras', 'pimpinan'] },
  ]

  const navItems = allNavItems.filter(item =>
    item.roles.includes(role) || item.roles.includes('admin_sarpras')
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={ubLogo} alt="UB Logo" className="sidebar-logo" />
        <div className="sidebar-brand">UB Adaptive</div>
        <div className="sidebar-subbrand">Smart Lighting Admin</div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'Admin User'}</span>
            <span className="user-email">{user?.email || 'admin@ub.ac.id'}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  )
}

// ─── Main Layout ──────────────────────────────────────────────
function MainLayout({ user, onLogout, children }) {
  return (
    <div className="app-container">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="main-content">
        <div className="topbar">
          <span className="status-badge online">
            <Wifi size={12} /> System Online
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}

// ─── App Router ───────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('auth_user')
    try { return raw ? JSON.parse(raw) : null } catch { return null }
  })

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken)
    setUser(newUser)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      })
    } catch { /* ignore */ }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
  }

  return (
    <BrowserRouter>
      {!token ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : (
        <MainLayout user={user} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard token={token} />} />
            <Route path="/control" element={<ControlCenter token={token} />} />
            <Route path="/settings" element={<ThresholdSettings token={token} />} />
            <Route path="/analytics" element={<Analytics token={token} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </MainLayout>
      )}
    </BrowserRouter>
  )
}
