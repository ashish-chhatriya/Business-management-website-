import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, today } from '../utils/fmt'
import { Modal, Empty, Spinner, FormField } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const CATS = ['Electricity','Water','Rent','Gas','Maintenance','Repairs','Miscellaneous','Ingredients']
const empty = { category:'Electricity', amount:'', expense_date:today(), expense_time:'', notes:'' }

export default function Expenses() {
  const { user } = useAuth()
  const isAdmin = ['admin','superadmin'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [filters, setFilters] = useState({ from:'', to:'', category:'' })

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.category) params.category = filters.category
      const [r, s] = await Promise.all([
        api.get('/expenses', { params }),
        api.get('/expenses/summary')
      ])
      setRows(r.data); setSummary(s.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setErr(''); setModal(true) }
  const openEdit = r => { setEditing(r); setForm({ category:r.category, amount:r.amount, expense_date:r.expense_date?.slice(0,10)||today(), expense_time:r.expense_time?.slice(0,5)||'', notes:r.notes||'' }); setErr(''); setModal(true) }

  const save = async () => {
    setErr(''); setSaving(true)
    try {
      if (!form.amount) { setErr('Amount required'); setSaving(false); return }
      if (editing) await api.put(`/expenses/${editing.id}`, form)
      else await api.post('/expenses', form)
      setModal(false); load()
    } catch(e) { setErr(e.response?.data?.error||'Save failed') }
    finally { setSaving(false) }
  }

  const del = async id => {
    if (!confirm('Delete this expense?')) return
    await api.delete(`/expenses/${id}`); load()
  }

  const f = (k,v) => setForm(p=>({...p,[k]:v}))
  const total = rows.reduce((s,r)=>s+parseFloat(r.amount||0),0)

  const catColors = { Rent:'orange', Electricity:'yellow', Water:'blue', Gas:'red', Maintenance:'purple', Repairs:'pink', Miscellaneous:'gray', Ingredients:'green' }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
          <p className="text-sm text-gray-500">Track all business expenses</p>
        </div>
        <button onClick={openAdd} className="btn-primary">+ Add Expense</button>
      </div>

      {/* Category summary */}
      {summary.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">This Month by Category</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.map(s => (
              <div key={s.category} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">{s.category}</div>
                <div className="font-bold text-gray-800">{fmt(s.total)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <span className="font-semibold text-gray-700">Total</span>
            <span className="font-bold text-red-600 text-lg">{fmt(total)}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input type="date" value={filters.from} onChange={e=>setFilters(p=>({...p,from:e.target.value}))} className="input w-36"/>
        <input type="date" value={filters.to} onChange={e=>setFilters(p=>({...p,to:e.target.value}))} className="input w-36"/>
        <select value={filters.category} onChange={e=>setFilters(p=>({...p,category:e.target.value}))} className="input w-40">
          <option value="">All Categories</option>
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
        <button onClick={load} className="btn-primary">Filter</button>
        <button onClick={()=>{ setFilters({from:'',to:'',category:''}); setTimeout(load,0) }} className="btn-secondary">Clear</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <Spinner/> : rows.length===0 ? <Empty/> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Code','Category','Amount','Date','Time','Notes','By',''].map(h=>(
                    <th key={h} className="table-header text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs text-gray-500">{r.expense_code}</td>
                    <td className="table-cell">
                      <span className="badge-blue text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{r.category}</span>
                    </td>
                    <td className="table-cell font-semibold text-red-600">{fmt(r.amount)}</td>
                    <td className="table-cell text-sm whitespace-nowrap">{fmtDate(r.expense_date)}</td>
                    <td className="table-cell text-sm">{r.expense_time?.slice(0,5)||'—'}</td>
                    <td className="table-cell text-xs text-gray-500 max-w-xs truncate">{r.notes||'—'}</td>
                    <td className="table-cell text-xs text-gray-400">{r.created_by_name}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        {isAdmin && <button onClick={()=>openEdit(r)} className="text-xs text-blue-600 hover:underline">Edit</button>}
                        {isAdmin && <button onClick={()=>del(r.id)} className="text-xs text-red-500 hover:underline">Del</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?'Edit Expense':'Add Expense'}>
        <div className="space-y-4">
          <FormField label="Category">
            <select value={form.category} onChange={e=>f('category',e.target.value)} className="input">
              {CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Amount (₹)">
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e=>f('amount',e.target.value)} placeholder="0.00" className="input"/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <input type="date" value={form.expense_date} onChange={e=>f('expense_date',e.target.value)} className="input"/>
            </FormField>
            <FormField label="Time">
              <input type="time" value={form.expense_time} onChange={e=>f('expense_time',e.target.value)} className="input"/>
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea value={form.notes} onChange={e=>f('notes',e.target.value)} rows={2} className="input resize-none"/>
          </FormField>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving…':'Save'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
