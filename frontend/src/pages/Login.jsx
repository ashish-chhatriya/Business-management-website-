import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: 'S', title: 'Sales Tracking', desc: 'Live dine-in, delivery, and parcel revenue' },
  { icon: 'I', title: 'Inventory', desc: 'Alerts for wrappers, sauces, and fillings' },
  { icon: 'P', title: 'Staff & Payroll', desc: 'Attendance, salary, and advances' },
]

function BrandMark({ small = false }) {
  return (
    <svg width={small ? 28 : 36} height={small ? 28 : 36} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M14 36c2-15 13-23 32-25 2 13 0 24-8 33-7 8-19 8-26 2-3-3-4-7-2-10Z" fill="#C8102E" />
      <path d="M21 34c5-5 14-8 25-9" stroke="#FFF3D6" strokeWidth="4" strokeLinecap="round" />
      <path d="M19 44c8 4 18 2 25-7" stroke="#E8A020" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function ThemeToggle({ theme, setTheme }) {
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-pressed={dark}
      className="theme-toggle"
    >
      <span className="theme-switch" aria-hidden="true">
        <span className="theme-track" />
        <span className="theme-thumb" />
      </span>
      <span>{dark ? 'Night' : 'Light'}</span>
    </button>
  )
}

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'light')

  const setTheme = value => {
    setThemeState(value)
    localStorage.setItem('theme', value)
  }

  useEffect(() => {
    document.body.classList.toggle('dark-mode', theme === 'dark')
  }, [theme])

  const onSubmit = async e => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      nav('/')
    } catch (e) {
      setErr(e.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#C8102E]/10" />
        <div className="absolute -bottom-16 -left-16 w-80 h-80 rounded-full bg-[#E8A020]/15" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-[var(--border)]/70" />
      </div>

      <div className="relative w-full max-w-5xl grid lg:grid-cols-[1.15fr_0.85fr] bg-[var(--surface)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--border)]">
        <div className="hidden lg:flex flex-col bg-gradient-to-br from-[#C8102E] to-[#991021] p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-black/10 translate-y-1/3 -translate-x-1/3" />

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg mb-8">
              <BrandMark />
            </div>

            <h1 className="text-4xl font-black text-white leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>
              Anand Fast<br />Food
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 bg-[#E8A020] px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span className="text-[#1A1208] text-xs font-bold">ERP Management System</span>
            </div>

            <p className="text-white/70 mt-5 text-sm leading-relaxed max-w-xs">
              Complete restaurant management platform for sales, inventory, staff, payroll, expenses, and multi-branch operations.
            </p>
          </div>

          <div className="relative z-10 mt-auto space-y-3">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-center gap-4 bg-white/10 rounded-2xl px-4 py-3 backdrop-blur-sm border border-white/10">
                <div className="w-9 h-9 rounded-xl bg-[#E8A020] flex items-center justify-center text-[#1A1208] font-black text-sm flex-shrink-0">
                  {f.icon}
                </div>
                <div>
                  <div className="text-white font-bold text-sm">{f.title}</div>
                  <div className="text-white/55 text-xs">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-7 sm:p-10 flex flex-col justify-center bg-[var(--surface)]">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="lg:hidden flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white border border-[var(--border)] flex items-center justify-center">
                <BrandMark small />
              </div>
              <div>
                <div className="font-bold text-[var(--ink)]" style={{ fontFamily: 'Syne, sans-serif' }}>
                  Anand Fast Food
                </div>
                <div className="text-xs text-[var(--muted)]">ERP Management System</div>
              </div>
            </div>
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--ink)]" style={{ fontFamily: 'Syne, sans-serif' }}>
              Welcome back
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              Sign in to Anand Fast Food ERP.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="text"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
                placeholder="superadmin@123 or your email"
                className="input"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  placeholder="Password"
                  className="input pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--chilli)] text-xs font-bold px-3 py-2 rounded-lg"
                >
                  {showPw ? 'Hide' : 'View'}
                </button>
              </div>
            </div>

            {err && (
              <div className="bg-[#FEE2E2] border border-[#FCA5A5] text-[#B91C1C] text-sm rounded-xl px-4 py-3">
                {err}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2 disabled:opacity-60">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}