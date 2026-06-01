import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, fmtTime, today } from '../utils/fmt'
import { Modal, Empty, Spinner, FormField, PaymentBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const MODES = ['Cash','UPI','Card','Bank Transfer']
const empty = { item_name:'', quantity:'', price_per_unit:'', payment_mode:'Cash', notes:'', sale_date:today(), sale_time:'' }

export default function Sales() {
  const { user } = useAuth()
  const isAdmin = ['admin','superadmin'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [filters, setFilters] = useState({ from:'', to:'', mode:'', search:'' })
  const [summary, setSummary] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.mode) params.mode = filters.mode
      if (filters.search) params.search = filters.search
      const [r, s] = await Promise.all([
        api.get('/sales', { params }),
        api.get('/sales/summary', { params: { period:'day', date:today() } })
      ])
      setRows(r.data)
      setSummary(s.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(empty); setErr(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ item_name:r.item_name, quantity:r.quantity, price_per_unit:r.price_per_unit, payment_mode:r.payment_mode, notes:r.notes||'', sale_date:r.sale_date?.slice(0,10)||today(), sale_time:r.sale_time?.slice(0,5)||'' }); setErr(''); setModal(true) }

  const save = async () => {
    setErr(''); setSaving(true)
    try {
      if (!form.item_name || !form.quantity || !form.price_per_unit) { setErr('Item, quantity and price are required'); setSaving(false); return }
      if (editing) await api.put(`/sales/${editing.id}`, form)
      else await api.post('/sales', form)
      setModal(false); load()
    } catch(e) { setErr(e.response?.data?.error||'Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this sale?')) return
    await api.delete(`/sales/${id}`)
    load()
  }

  const f = (k,v) => setForm(p=>({...p,[k]:v}))
  const total = form.quantity && form.price_per_unit ? parseFloat(form.quantity)*parseFloat(form.price_per_unit) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales</h1>
          <p className="text-sm text-gray-500">Track all sales transactions</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <span>+</span> Add Sale
        </button>
      </div>

      {/* Today summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Today Sales', fmt(summary.total_sales), '💰'],
            ['Orders', summary.total_orders, '🧾'],
            ['Avg Order', fmt(summary.avg_order), '📊'],
            ['UPI', fmt(summary.upi), '📱'],
          ].map(([l,v,ic]) => (
            <div key={l} className="card p-4 flex items-center gap-3">
              <span className="text-2xl">{ic}</span>
              <div><div className="text-xs text-gray-400 font-semibold uppercase">{l}</div><div className="font-bold text-gray-800">{v}</div></div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input type="date" value={filters.from} onChange={e=>setFilters(p=>({...p,from:e.target.value}))} className="input w-36" placeholder="From"/>
        <input type="date" value={filters.to} onChange={e=>setFilters(p=>({...p,to:e.target.value}))} className="input w-36" placeholder="To"/>
        <select value={filters.mode} onChange={e=>setFilters(p=>({...p,mode:e.target.value}))} className="input w-36">
          <option value="">All Modes</option>
          {MODES.map(m=><option key={m}>{m}</option>)}
        </select>
        <input value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))}
          placeholder="Search item / code…" className="input w-44"/>
        <button onClick={load} className="btn-primary px-4">Filter</button>
        <button onClick={()=>{ setFilters({from:'',to:'',mode:'',search:''}); setTimeout(load,0) }} className="btn-secondary">Clear</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <Spinner/> : rows.length === 0 ? <Empty/> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Code','Date','Time','Item','Qty','Price','Total','Mode','By',''].map(h=>(
                    <th key={h} className="table-header text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-500">{r.sale_code}</td>
                    <td className="table-cell text-sm whitespace-nowrap">{fmtDate(r.sale_date)}</td>
                    <td className="table-cell text-sm">{fmtTime(r.sale_time)}</td>
                    <td className="table-cell font-medium">{r.item_name}</td>
                    <td className="table-cell text-center">{r.quantity}</td>
                    <td className="table-cell">{fmt(r.price_per_unit)}</td>
                    <td className="table-cell font-semibold text-green-700">{fmt(r.total_amount)}</td>
                    <td className="table-cell"><PaymentBadge mode={r.payment_mode}/></td>
                    <td className="table-cell text-xs text-gray-400">{r.created_by_name}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button onClick={()=>openEdit(r)} className="text-xs text-blue-600 hover:underline">Edit</button>
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

      {/* Modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?'Edit Sale':'Add Sale'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Sale Date">
              <input type="date" value={form.sale_date} onChange={e=>f('sale_date',e.target.value)} className="input"/>
            </FormField>
            <FormField label="Sale Time">
              <input type="time" value={form.sale_time} onChange={e=>f('sale_time',e.target.value)} className="input"/>
            </FormField>
          </div>
          <FormField label="Item Name">
            <input value={form.item_name} onChange={e=>f('item_name',e.target.value)} placeholder="e.g. Chicken Burger" className="input"/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Quantity">
              <input type="number" min="1" value={form.quantity} onChange={e=>f('quantity',e.target.value)} className="input"/>
            </FormField>
            <FormField label="Price Per Unit (₹)">
              <input type="number" min="0" step="0.01" value={form.price_per_unit} onChange={e=>f('price_per_unit',e.target.value)} className="input"/>
            </FormField>
          </div>
          {total > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-center">
              <span className="text-sm text-gray-500">Total Amount: </span>
              <span className="text-xl font-bold text-orange-600">{fmt(total)}</span>
            </div>
          )}
          <FormField label="Payment Mode">
            <select value={form.payment_mode} onChange={e=>f('payment_mode',e.target.value)} className="input">
              {MODES.map(m=><option key={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label="Notes (optional)">
            <textarea value={form.notes} onChange={e=>f('notes',e.target.value)} rows={2} className="input resize-none"/>
          </FormField>
          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving…':'Save Sale'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
