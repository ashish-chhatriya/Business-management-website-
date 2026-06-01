import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', icon: 'D', label: 'Dashboard' },
  { to: '/sales', icon: 'S', label: 'Sales' },
  { to: '/shops', icon: 'H', label: 'Shops', adminOnly: true },
  { to: '/expenses', icon: 'E', label: 'Expenses' },
  { to: '/purchases', icon: 'P', label: 'Purchases' },
  { to: '/inventory', icon: 'I', label: 'Inventory' },
  { to: '/employees', icon: 'M', label: 'Employees' },
  { to: '/attendance', icon: 'A', label: 'Attendance' },
  { to: '/salary', icon: 'R', label: 'Salary' },
  { to: '/reports', icon: 'T', label: 'Reports' },
  { to: '/audit', icon: 'L', label: 'Audit Log', adminOnly: true },
  { to: '/settings', icon: 'G', label: 'Settings', adminOnly: true },
]

function ThemeToggle({ theme, setTheme }) {
  const dark = theme === 'dark'
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="theme-toggle compact" aria-pressed={dark}>
      <span className="theme-switch" aria-hidden="true"><span className="theme-track" /><span className="theme-thumb" /></span>
      <span>{dark ? 'Night' : 'Light'}</span>
    </button>
  )
}

function NavItem({ item, active, onClick }) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`
        flex items-center gap-3 mx-3 px-3.5 py-2.5 rounded-xl text-sm font-medium
        transition-all duration-200 mb-0.5 group
        ${active ? 'bg-white text-[#C8102E] shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white'}
      `}
    >
      <span className={`
        w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0
        ${active ? 'bg-[#FFF3D6] text-[#E8A020]' : 'bg-white/10 text-white/70 group-hover:text-[#E8A020]'}
      `}>
        {item.icon}
      </span>
      <span className="font-semibold" style={{ fontFamily: active ? 'Syne, sans-serif' : 'inherit' }}>
        {item.label}
      </span>
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#E8A020]" />}
    </Link>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'light')

  const setTheme = value => {
    setThemeState(value)
    localStorage.setItem('theme', value)
  }

  useEffect(() => {
    document.body.classList.toggle('dark-mode', theme === 'dark')
  }, [theme])

  let visible = NAV.filter(n => !n.adminOnly || ['admin', 'superadmin'].includes(user?.role))
  // If the logged-in user is an employee, limit navigation to only the pages they need
  if (user?.role === 'employee') {
    const allowed = ['/sales', '/expenses', '/salary']
    visible = NAV.filter(n => allowed.includes(n.to))
  }
  const initials = user?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="flex h-screen bg-[var(--cream)] text-[var(--ink)]">
      {open && <div className="fixed inset-0 z-20 bg-[#1A1208]/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 flex flex-col bg-gradient-to-b from-[#C8102E] to-[#991021]
          transition-transform duration-300 ease-in-out shadow-[4px_0_32px_rgba(200,16,46,0.20)]
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ width: '268px' }}
      >
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="text-[#C8102E] font-black text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>AF</span>
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold text-sm leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
                Anand Fast Food
              </div>
              <div className="text-[#E8A020] text-xs font-medium truncate mt-0.5">
                {user?.domain_name || 'Management System'}
              </div>
            </div>
          </div>
          <div className="mt-4 h-px bg-white/10" />
          <div className="mt-3 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#E8A020]" />
            <span className="text-white/55 text-[10px] font-bold uppercase tracking-widest">Navigation</span>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {visible.map(n => <NavItem key={n.to} item={n} active={pathname === n.to} onClick={() => setOpen(false)} />)}
        </nav>

        <div className="p-4">
          <div className="h-px bg-white/10 mb-4" />
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8A020] flex items-center justify-center text-[#1A1208] font-bold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-white/55 text-xs capitalize">{user?.role}</div>
            </div>
            <button onClick={logout} title="Sign out" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
              <span aria-hidden="true">X</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-[var(--surface)] border-b border-[var(--border)] px-4 lg:px-6 py-3.5 flex items-center gap-4 shadow-sm">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2 rounded-xl text-[var(--ink-mid)] hover:bg-[var(--cream-dark)]">
            <span className="font-black">=</span>
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--ink)]" style={{ fontFamily: 'Syne, sans-serif' }}>
              Business Management
            </div>
            <div className="text-xs text-[var(--muted)]">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          <ThemeToggle theme={theme} setTheme={setTheme} />
          <div className="hidden sm:flex items-center gap-2 bg-[#DCFCE7] text-[#15803D] text-xs font-bold px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            Live
          </div>
          <div className="hidden sm:block"><span className="badge-yellow capitalize">{user?.role}</span></div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-7 scrollbar-thin bg-[var(--cream)]">
          {children}
        </main>

        <footer className="bg-[var(--surface)] border-t border-[var(--border)] px-5 py-2.5 flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">Business Management System</span>
          <span className="text-xs text-[var(--muted)]">v2.0</span>
        </footer>
      </div>
    </div>
  )
}
