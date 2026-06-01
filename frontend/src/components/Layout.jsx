import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to:'/', icon:'📊', label:'Dashboard' },
  { to:'/sales', icon:'💰', label:'Sales' },
  { to:'/expenses', icon:'💸', label:'Expenses' },
  { to:'/purchases', icon:'🛒', label:'Purchases' },
  { to:'/inventory', icon:'📦', label:'Inventory' },
  { to:'/employees', icon:'👥', label:'Employees' },
  { to:'/attendance', icon:'📋', label:'Attendance' },
  { to:'/salary', icon:'💼', label:'Salary' },
  { to:'/reports', icon:'📈', label:'Reports' },
  { to:'/audit', icon:'🔍', label:'Audit Log', adminOnly:true },
  { to:'/settings', icon:'⚙️', label:'Settings', adminOnly:true },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const visible = NAV.filter(n => !n.adminOnly || ['admin','superadmin'].includes(user?.role))

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={()=>setOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#1a1a2e] flex flex-col transition-transform duration-300 ${open?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍔</span>
            <div>
              <div className="font-bold text-white text-lg leading-tight">QuickBite</div>
              <div className="text-orange-400 text-xs font-medium">{user?.domain_name}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
          {visible.map(n => (
            <Link key={n.to} to={n.to} onClick={()=>setOpen(false)}
              className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 mb-0.5 ${
                pathname===n.to ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}>
              <span className="text-base w-5 text-center">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.name}</div>
              <div className="text-gray-400 text-xs capitalize">{user?.role}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full text-center text-sm text-gray-400 hover:text-red-400 transition-colors py-1">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={()=>setOpen(true)} className="lg:hidden text-gray-500 p-1">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h16M3 12h16M3 18h16"/>
            </svg>
          </button>
          <div className="flex-1 text-gray-500 text-sm">
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-orange text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold capitalize">
              {user?.role}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  )
}
