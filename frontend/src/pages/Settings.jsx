import { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Spinner, Modal, FormField } from '../components/ui'
import { fmtDate } from '../utils/fmt'

const TABS = ['Business Info', 'User Management', 'Change Password']

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  )
}

/* ─── Business Info Tab ─── */
function BusinessInfoTab({ user }) {
  const [domain, setDomain] = useState(null)
  const [form, setForm]     = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  useEffect(() => {
    api.get('/settings/domain').then(({ data }) => {
      setDomain(data)
      setForm({ name: data.name, address: data.address || '', phone: data.phone || '' })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      await api.put('/settings/domain', form)
      setMsg({ type: 'success', text: 'Business info updated successfully.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner/>
  const isAdmin = ['admin','superadmin'].includes(user?.role)

  return (
    <div className="space-y-6">
      <Section title="Branch Details">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FormField label="Business / Branch Name">
            <input className="input" value={form.name || ''} disabled={!isAdmin}
              onChange={e => setForm({ ...form, name: e.target.value })}/>
          </FormField>
          <FormField label="Branch Slug (read-only)">
            <input className="input bg-gray-50 text-gray-400" value={domain?.slug || ''} disabled/>
          </FormField>
          <FormField label="Phone">
            <input className="input" value={form.phone || ''} disabled={!isAdmin}
              placeholder="+91 98765 43210"
              onChange={e => setForm({ ...form, phone: e.target.value })}/>
          </FormField>
          <FormField label="Address">
            <input className="input" value={form.address || ''} disabled={!isAdmin}
              placeholder="Branch address"
              onChange={e => setForm({ ...form, address: e.target.value })}/>
          </FormField>
        </div>
      </Section>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === 'success'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {msg.text}
        </div>
      )}

      {isAdmin && (
        <div>
          <button onClick={save} disabled={saving} className="btn-primary px-6 py-2">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      <Section title="System Info">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Domain ID', domain?.id?.slice(0,8) + '…'],
            ['Status', domain?.is_active ? '✅ Active' : '❌ Inactive'],
            ['Created', fmtDate(domain?.created_at)],
            ['Your Role', user?.role?.toUpperCase()],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="text-xs text-gray-400 font-medium mb-1">{label}</div>
              <div className="text-sm font-semibold text-gray-700">{val}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

/* ─── User Management Tab ─── */
function UserManagementTab({ user: currentUser }) {
  const [users, setUsers] = useState([])
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [pwModal, setPwModal] = useState(null)   // { id, name }
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'employee', shop_id:'' })
  const [pwForm, setPwForm] = useState({ password:'', confirm:'' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/auth/users').then(({ data }) => setUsers(data)).finally(() => setLoading(false))
  }
  useEffect(() => {
    api.get('/shops').then(({ data }) => setShops(data)).catch(() => {})
  }, [])
  useEffect(load, [])

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) return setErr('All fields are required')
    if (form.password.length < 6) return setErr('Password must be at least 6 characters')
    if (form.role === 'employee' && !form.shop_id) return setErr('Select a shop for this employee')
    setSaving(true); setErr('')
    try {
      await api.post('/auth/users', form)
      setModalOpen(false)
      setForm({ name:'', email:'', password:'', role:'employee', shop_id:'' })
      load()
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to create user')
    } finally { setSaving(false) }
  }

  const toggleUser = async (id) => {
    await api.put(`/auth/users/${id}/toggle`)
    load()
  }

  const changePassword = async () => {
    if (!pwForm.password || pwForm.password.length < 6) return setErr('Minimum 6 characters')
    if (pwForm.password !== pwForm.confirm) return setErr('Passwords do not match')
    setSaving(true); setErr('')
    try {
      await api.put(`/auth/users/${pwModal.id}/password`, { password: pwForm.password })
      setPwModal(null); setPwForm({ password:'', confirm:'' })
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to update password')
    } finally { setSaving(false) }
  }

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''} in this branch</p>
        {['admin','superadmin'].includes(currentUser?.role) && (
          <button onClick={() => { setModalOpen(true); setErr('') }} className="btn-primary text-sm px-4 py-1.5">
            + Add User
          </button>
        )}
      </div>

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {u.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                {u.name}
                {u.id === currentUser?.id && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">You</span>
                )}
              </div>
              <div className="text-xs text-gray-400">{u.email}</div>
              {u.shop_name && (
                <div className="text-xs text-gray-500 mt-0.5">Shop: {u.shop_name}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                u.role === 'superadmin' ? 'bg-purple-100 text-purple-700'
                : u.role === 'admin'   ? 'bg-orange-100 text-orange-700'
                : u.role === 'manager' ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
              }`}>{u.role}</span>

              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>{u.is_active ? 'Active' : 'Inactive'}</span>

              {u.last_login && (
                <span className="text-xs text-gray-400 hidden lg:block">
                  Last: {fmtDate(u.last_login)}
                </span>
              )}

              {['admin','superadmin'].includes(currentUser?.role) && u.id !== currentUser?.id && (
                <>
                  <button
                    onClick={() => { setPwModal({ id: u.id, name: u.name }); setErr('') }}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                  >Reset PW</button>
                  <button
                    onClick={() => toggleUser(u.id)}
                    className={`text-xs font-medium transition-colors ${
                      u.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'
                    }`}
                  >{u.is_active ? 'Disable' : 'Enable'}</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New User">
        <div className="space-y-3">
          <FormField label="Full Name">
            <input className="input" placeholder="Name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}/>
          </FormField>
          <FormField label="Email">
            <input type="email" className="input" placeholder="email@example.com" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}/>
          </FormField>
          <FormField label="Password">
            <input type="password" className="input" placeholder="Min. 6 characters" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}/>
          </FormField>
          <FormField label="Role">
            <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value, shop_id: e.target.value === 'employee' ? form.shop_id : '' })}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              {currentUser?.role === 'superadmin' && <option value="admin">Admin</option>}
            </select>
          </FormField>
          {form.role === 'employee' && (
            <FormField label="Assigned Shop">
              <select className="input" value={form.shop_id} onChange={e => setForm({ ...form, shop_id: e.target.value })}>
                <option value="">Select shop</option>
                {shops.map(shop => (
                  <option key={shop.id} value={shop.id}>{shop.name}</option>
                ))}
              </select>
            </FormField>
          )}
          {err && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={createUser} disabled={saving} className="btn-primary flex-1 py-2">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1 py-2">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!pwModal} onClose={() => setPwModal(null)} title={`Reset Password — ${pwModal?.name}`}>
        <div className="space-y-3">
          <FormField label="New Password">
            <input type="password" className="input" placeholder="Min. 6 characters"
              value={pwForm.password} onChange={e => setPwForm({ ...pwForm, password: e.target.value })}/>
          </FormField>
          <FormField label="Confirm Password">
            <input type="password" className="input" placeholder="Re-enter password"
              value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}/>
          </FormField>
          {err && <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={changePassword} disabled={saving} className="btn-primary flex-1 py-2">
              {saving ? 'Updating…' : 'Update Password'}
            </button>
            <button onClick={() => setPwModal(null)} className="btn-secondary flex-1 py-2">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Change Password Tab ─── */
function ChangePasswordTab({ user }) {
  const [form, setForm] = useState({ current:'', newPw:'', confirm:'' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async () => {
    if (!form.current || !form.newPw) return setMsg({ type:'error', text:'All fields required' })
    if (form.newPw.length < 6) return setMsg({ type:'error', text:'New password must be at least 6 characters' })
    if (form.newPw !== form.confirm) return setMsg({ type:'error', text:'Passwords do not match' })
    setSaving(true); setMsg(null)
    try {
      await api.put('/settings/change-password', { current_password: form.current, new_password: form.newPw })
      setMsg({ type:'success', text:'Password changed successfully.' })
      setForm({ current:'', newPw:'', confirm:'' })
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || 'Failed to change password' })
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-gray-500">Change your own account password. You'll be logged in with the new password on your next session.</p>
      <FormField label="Current Password">
        <input type="password" className="input" placeholder="Your current password"
          value={form.current} onChange={e => setForm({ ...form, current: e.target.value })}/>
      </FormField>
      <FormField label="New Password">
        <input type="password" className="input" placeholder="At least 6 characters"
          value={form.newPw} onChange={e => setForm({ ...form, newPw: e.target.value })}/>
      </FormField>
      <FormField label="Confirm New Password">
        <input type="password" className="input" placeholder="Re-enter new password"
          value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })}/>
      </FormField>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === 'success'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}>{msg.text}</div>
      )}

      <button onClick={submit} disabled={saving} className="btn-primary px-6 py-2">
        {saving ? 'Updating…' : 'Change Password'}
      </button>
    </div>
  )
}

/* ─── Main Page ─── */
export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState(0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your business configuration and users</p>
      </div>

      {/* Tabs */}
      <div className="card p-1 inline-flex gap-1">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === i ? 'bg-orange-500 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card p-5 lg:p-6">
        {tab === 0 && <BusinessInfoTab user={user}/>}
        {tab === 1 && <UserManagementTab user={user}/>}
        {tab === 2 && <ChangePasswordTab user={user}/>}
      </div>
    </div>
  )
}
