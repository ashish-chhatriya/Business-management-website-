import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ email:'', password:'' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async e => {
    e.preventDefault()
    setErr(''); setLoading(true)
    try {
      await login(form.email, form.password)
      nav('/')
    } catch(e) {
      setErr(e.response?.data?.error || 'Login failed')
    } finally { setLoading(false) }
  }

  const demoLogin = (email, pw) => setForm({ email, password: pw })

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🍔</div>
          <h1 className="text-3xl font-bold text-white">QuickBite ERP</h1>
          <p className="text-gray-400 mt-1 text-sm">Fast Food Business Management System</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}
                required placeholder="your@email.com"
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                required placeholder="••••••••"
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"/>
            </div>
            {err && <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-sm rounded-xl px-3 py-2">{err}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-all">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/10">
            <p className="text-gray-400 text-xs mb-2 text-center">Demo Credentials</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                ['Super Admin','superadmin@quickbite.com','Admin@123'],
                ['Admin (Andheri)','admin@andheri.quickbite.com','Admin@123'],
                ['Manager','manager@andheri.quickbite.com','Manager@123'],
              ].map(([label,email,pw])=>(
                <button key={email} onClick={()=>demoLogin(email,pw)}
                  className="text-left text-xs bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-2 rounded-lg transition-colors">
                  <span className="font-semibold text-orange-400">{label}</span> — {email}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
