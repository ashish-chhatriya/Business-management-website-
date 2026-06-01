import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, today } from '../utils/fmt'
import { Modal, Spinner, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'bag', 'box', 'dozen', 'bundle']

export default function Purchases() {
  const { user } = useAuth()
  const isAdmin = ['admin', 'superadmin'].includes(user?.role)

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm]       = useState(defaultForm())

  function defaultForm() {
    return { ingredient_name:'', vendor_name:'', quantity:'', unit:'kg', price_paid:'', purchase_date: today(), purchase_time:'', bill_number:'', notes:'' }
  }

  const load = () => {
    setLoading(true)
    const params = {}
    if (search) params.search = search
    if (from)   params.from   = from
    if (to)     params.to     = to
    api.get('/purchases', { params })
      .then(r => setRows(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, from, to])

  const openAdd = () => { setEditing(null); setForm(defaultForm()); setModal(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({
      ingredient_name: r.ingredient_name,
      vendor_name:     r.vendor_name || '',
      quantity:        r.quantity,
      unit:            r.unit || 'kg',
      price_paid:      r.price_paid,
      purchase_date:   r.purchase_date?.slice(0,10),
      purchase_time:   r.purchase_time?.slice(0,5) || '',
      bill_number:     r.bill_number || '',
      notes:           r.notes || '',
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.ingredient_name || !form.quantity || !form.price_paid) return
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/purchases/${editing.id}`, form)
      } else {
        await api.post('/purchases', form)
      }
      setModal(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving purchase')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this purchase?')) return
    setDeleting(id)
    try {
      await api.delete(`/purchases/${id}`)
      load()
    } finally {
      setDeleting(null)
    }
  }

  const totalSpent = rows.reduce((s, r) => s + parseFloat(r.price_paid || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Purchases</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track ingredient & stock purchases</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Add Purchase
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Records</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{rows.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Spent</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{fmt(totalSpent)}</div>
        </div>
        <div className="card p-5 col-span-2 lg:col-span-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Avg. Per Purchase</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">
            {rows.length ? fmt(totalSpent / rows.length) : '₹0'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search ingredient or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <input type="date" className="input w-40" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input w-40" value={to}   onChange={e => setTo(e.target.value)} />
        {(from || to || search) && (
          <button className="btn-secondary" onClick={() => { setFrom(''); setTo(''); setSearch('') }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty msg="No purchases found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header text-left">Code</th>
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Ingredient</th>
                  <th className="table-header text-left">Vendor</th>
                  <th className="table-header text-right">Qty</th>
                  <th className="table-header text-right">Amount</th>
                  <th className="table-header text-left">Bill No.</th>
                  {isAdmin && <th className="table-header text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <span className="badge-gray font-mono">{r.purchase_code}</span>
                    </td>
                    <td className="table-cell text-gray-600">{fmtDate(r.purchase_date)}</td>
                    <td className="table-cell font-medium text-gray-800">{r.ingredient_name}</td>
                    <td className="table-cell text-gray-500">{r.vendor_name || '—'}</td>
                    <td className="table-cell text-right text-gray-700">
                      {r.quantity} <span className="text-gray-400 text-xs">{r.unit}</span>
                    </td>
                    <td className="table-cell text-right font-semibold text-gray-800">{fmt(r.price_paid)}</td>
                    <td className="table-cell text-gray-500 font-mono text-xs">{r.bill_number || '—'}</td>
                    {isAdmin && (
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(r)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                          <button
                            onClick={() => remove(r.id)}
                            disabled={deleting === r.id}
                            className="text-xs text-red-400 hover:text-red-600 font-medium"
                          >
                            {deleting === r.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Purchase' : 'Add Purchase'} wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Ingredient Name *</label>
            <input className="input" value={form.ingredient_name}
              onChange={e => setForm(f => ({...f, ingredient_name: e.target.value}))}
              placeholder="e.g. Tomatoes" />
          </div>
          <div>
            <label className="label">Vendor Name</label>
            <input className="input" value={form.vendor_name}
              onChange={e => setForm(f => ({...f, vendor_name: e.target.value}))}
              placeholder="Supplier / vendor" />
          </div>
          <div>
            <label className="label">Quantity *</label>
            <input className="input" type="number" min="0" step="0.01" value={form.quantity}
              onChange={e => setForm(f => ({...f, quantity: e.target.value}))}
              placeholder="0" />
          </div>
          <div>
            <label className="label">Unit</label>
            <select className="input" value={form.unit}
              onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Price Paid (₹) *</label>
            <input className="input" type="number" min="0" step="0.01" value={form.price_paid}
              onChange={e => setForm(f => ({...f, price_paid: e.target.value}))}
              placeholder="0.00" />
          </div>
          <div>
            <label className="label">Bill Number</label>
            <input className="input" value={form.bill_number}
              onChange={e => setForm(f => ({...f, bill_number: e.target.value}))}
              placeholder="Invoice / bill no." />
          </div>
          <div>
            <label className="label">Purchase Date</label>
            <input className="input" type="date" value={form.purchase_date}
              onChange={e => setForm(f => ({...f, purchase_date: e.target.value}))} />
          </div>
          <div>
            <label className="label">Purchase Time</label>
            <input className="input" type="time" value={form.purchase_time}
              onChange={e => setForm(f => ({...f, purchase_time: e.target.value}))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              placeholder="Optional notes…" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update Purchase' : 'Add Purchase'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
