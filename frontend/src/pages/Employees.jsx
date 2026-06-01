import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmtDate, fmt } from '../utils/fmt'
import { Modal, Empty, Spinner, FormField, Badge } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const empty = { name:'', phone:'', address:'', designation:'', monthly_salary:'', joining_date:'', fingerprint_id:'', status:'active' }

export default function Employees() {
  const { user } = useAuth()
  const isAdmin = ['admin','superadmin'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/employees', { params: search ? { search } : {} })
      setRows(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setErr(''); setModal(true) }
  const openEdit = r => {
    setEditing(r)
    setForm({ name:r.name, phone:r.phone||'', address:r.address||'', designation:r.designation||'', monthly_salary:r.monthly_salary, joining_date:r.joining_date?.slice(0,10)||'', fingerprint_id:r.fingerprint_id||'', status:r.status })
    setErr(''); setModal(true)
  }

  const save = async () => {
    setErr(''); setSaving(true)
    try {
      if (!form.name || !form.monthly_salary) { setErr('Name and salary required'); setSaving(false); return }
      if (editing) await api.put(`/employees/${editing.id}`, form)
      else await api.post('/employees', form)
      setModal(false); load()
    } catch(e) { setErr(e.response?.data?.error||'Save failed') }
    finally { setSaving(false) }
  }

  const del = async id => {
    if (!confirm('Deactivate this employee?')) return
    await api.delete(`/employees/${id}`); load()
  }

  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{color:'var(--ink)'}}>Employees</h1>
          <p className="text-sm" style={{color:'var(--muted)'}}>{rows.length} employees</p>
        </div>
        {isAdmin && <button onClick={openAdd} className="btn-primary">+ Add Employee</button>}
      </div>

      <div className="card p-4 flex gap-3">
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}
          placeholder="Search by name or code…" className="input flex-1"/>
        <button onClick={load} className="btn-primary">Search</button>
      </div>

      {/* Employee cards */}
      {loading ? <Spinner/> : rows.length===0 ? <Empty/> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(r=>(
            <div key={r.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-lg shadow">
                    {r.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold" style={{color:'var(--ink)'}}>{r.name}</div>
                    <div className="text-xs" style={{color:'var(--muted)'}}>{r.emp_code}</div>
                  </div>
                </div>
                <Badge status={r.status}/>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span style={{color:'var(--muted)'}}>Role</span>
                  <span className="font-medium">{r.designation||'—'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{color:'var(--muted)'}}>Salary</span>
                  <span className="font-semibold text-green-700">{fmt(r.monthly_salary)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span style={{color:'var(--muted)'}}>Phone</span>
                  <span>{r.phone||'—'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{color:'var(--muted)'}}>Joined</span>
                  <span>{fmtDate(r.joining_date)}</span>
                </div>
                {r.fingerprint_id && (
                  <div className="flex justify-between">
                    <span style={{color:'var(--muted)'}}>Fingerprint</span>
                    <span className="font-mono text-xs">{r.fingerprint_id}</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button onClick={()=>openEdit(r)} className="btn-secondary text-xs flex-1">Edit</button>
                  <button onClick={()=>del(r.id)} className="text-xs text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors">Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?'Edit Employee':'Add Employee'} wide>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name">
            <input value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Rahul Sharma" className="input"/>
          </FormField>
          <FormField label="Phone">
            <input value={form.phone} onChange={e=>f('phone',e.target.value)} placeholder="9876543210" className="input"/>
          </FormField>
          <FormField label="Designation">
            <input value={form.designation} onChange={e=>f('designation',e.target.value)} placeholder="Cook, Cashier…" className="input"/>
          </FormField>
          <FormField label="Monthly Salary (₹)">
            <input type="number" min="0" value={form.monthly_salary} onChange={e=>f('monthly_salary',e.target.value)} className="input"/>
          </FormField>
          <FormField label="Joining Date">
            <input type="date" value={form.joining_date} onChange={e=>f('joining_date',e.target.value)} className="input"/>
          </FormField>
          <FormField label="Fingerprint ID">
            <input value={form.fingerprint_id} onChange={e=>f('fingerprint_id',e.target.value)} placeholder="FP-001" className="input"/>
          </FormField>
          <div className="col-span-2">
            <FormField label="Address">
              <textarea value={form.address} onChange={e=>f('address',e.target.value)} rows={2} className="input resize-none"/>
            </FormField>
          </div>
          {editing && (
            <FormField label="Status">
              <select value={form.status} onChange={e=>f('status',e.target.value)} className="input">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
          )}
        </div>
        {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}
        <div className="flex gap-3 pt-4">
          <button onClick={()=>setModal(false)} className="btn-secondary flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving…':'Save Employee'}</button>
        </div>
      </Modal>
    </div>
  )
}
