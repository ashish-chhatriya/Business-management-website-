import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmtDate } from '../utils/fmt'
import { Spinner, Empty, Modal, FormField } from '../components/ui'

export default function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')   // 'all' | 'low'
  const [modal, setModal] = useState(null)       // null | 'add' | 'edit' | 'adjust'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ ingredient_name: '', unit: '', current_stock: '', minimum_stock: '', cost_per_unit: '' })
  const [adjForm, setAdjForm] = useState({ qty: '', note: '', type: 'add' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/inventory')
      setItems(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = items.filter(item => {
    const matchSearch = !search || item.ingredient_name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'low' && parseFloat(item.current_stock) <= parseFloat(item.minimum_stock))
    return matchSearch && matchFilter
  })

  const lowCount = items.filter(i => parseFloat(i.current_stock) <= parseFloat(i.minimum_stock)).length

  const openAdd = () => {
    setForm({ ingredient_name: '', unit: 'kg', current_stock: '', minimum_stock: '', cost_per_unit: '' })
    setSelected(null)
    setModal('add')
  }

  const openEdit = (item) => {
    setForm({
      ingredient_name: item.ingredient_name,
      unit: item.unit,
      current_stock: item.current_stock,
      minimum_stock: item.minimum_stock,
      cost_per_unit: item.cost_per_unit || '',
    })
    setSelected(item)
    setModal('edit')
  }

  const openAdjust = (item) => {
    setSelected(item)
    setAdjForm({ qty: '', note: '', type: 'add' })
    setModal('adjust')
  }

  const save = async () => {
    if (!form.ingredient_name || !form.unit) return alert('Name and unit are required')
    setSaving(true)
    try {
      if (modal === 'add') {
        await api.post('/inventory', form)
      } else {
        await api.put(`/inventory/${selected.id}`, form)
      }
      setModal(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveAdjust = async () => {
    if (!adjForm.qty || isNaN(adjForm.qty)) return alert('Enter a valid quantity')
    setSaving(true)
    try {
      await api.post(`/inventory/${selected.id}/adjust`, {
        quantity: parseFloat(adjForm.qty),
        type: adjForm.type,
        note: adjForm.note,
      })
      setModal(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Adjustment failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this inventory item?')) return
    try {
      await api.delete(`/inventory/${id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    }
  }

  const stockColor = (item) => {
    const ratio = parseFloat(item.current_stock) / Math.max(parseFloat(item.minimum_stock), 0.01)
    if (ratio <= 1) return 'text-red-600 bg-red-50 border-red-100'
    if (ratio <= 1.5) return 'text-yellow-600 bg-yellow-50 border-yellow-100'
    return 'text-green-600 bg-green-50 border-green-100'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage ingredient stock levels</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <span>+ Add Item</span>
        </button>
      </div>

      {/* Alerts */}
      {lowCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <span className="text-sm font-semibold text-orange-700">
            {lowCount} item{lowCount > 1 ? 's' : ''} below minimum stock level
          </span>
          <button onClick={() => setFilter('low')} className="ml-auto text-xs font-semibold text-orange-600 underline underline-offset-2">
            View all
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search ingredient…" value={search}
          onChange={e => setSearch(e.target.value)} className="input w-56" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[{ key: 'all', label: 'All Items' }, { key: 'low', label: `⚠️ Low Stock (${lowCount})` }].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.key ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: items.length, icon: '📦', bg: 'from-blue-500 to-blue-600' },
          { label: 'Low Stock', value: lowCount, icon: '⚠️', bg: 'from-orange-500 to-orange-600' },
          { label: 'Well Stocked', value: items.filter(i => parseFloat(i.current_stock) > parseFloat(i.minimum_stock) * 1.5).length, icon: '✅', bg: 'from-green-500 to-green-600' },
          { label: 'Out of Stock', value: items.filter(i => parseFloat(i.current_stock) <= 0).length, icon: '❌', bg: 'from-red-500 to-red-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.bg} flex items-center justify-center text-lg`}>{s.icon}</div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{s.label}</div>
              <div className="text-xl font-bold text-gray-800">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header text-left">Ingredient</th>
                  <th className="table-header">Unit</th>
                  <th className="table-header">Current Stock</th>
                  <th className="table-header">Min Stock</th>
                  <th className="table-header">Cost/Unit</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Last Updated</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.length === 0 && (
                  <tr><td colSpan={8}><Empty msg="No inventory items found" /></td></tr>
                )}
                {visible.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="table-cell font-semibold text-gray-800">{item.ingredient_name}</td>
                    <td className="table-cell text-center text-gray-500">{item.unit}</td>
                    <td className="table-cell text-center font-bold text-gray-700">{item.current_stock}</td>
                    <td className="table-cell text-center text-gray-500">{item.minimum_stock}</td>
                    <td className="table-cell text-center text-gray-500">
                      {item.cost_per_unit ? `₹${item.cost_per_unit}` : '—'}
                    </td>
                    <td className="table-cell text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${stockColor(item)}`}>
                        {parseFloat(item.current_stock) <= 0
                          ? 'Out of Stock'
                          : parseFloat(item.current_stock) <= parseFloat(item.minimum_stock)
                          ? 'Low Stock'
                          : 'OK'}
                      </span>
                    </td>
                    <td className="table-cell text-center text-gray-400 text-xs">{fmtDate(item.updated_at)}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openAdjust(item)}
                          className="text-blue-500 hover:text-blue-700 text-xs font-semibold transition-colors">Adjust</button>
                        <button onClick={() => openEdit(item)}
                          className="text-orange-500 hover:text-orange-700 text-xs font-semibold transition-colors">Edit</button>
                        <button onClick={() => remove(item.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-semibold transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'add' ? 'Add Inventory Item' : 'Edit Inventory Item'}>
        <div className="space-y-4">
          <FormField label="Ingredient Name">
            <input type="text" value={form.ingredient_name}
              onChange={e => setForm(p => ({ ...p, ingredient_name: e.target.value }))}
              placeholder="e.g. Chicken Breast" className="input" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Unit">
              <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className="input">
                {['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'pack'].map(u => <option key={u}>{u}</option>)}
              </select>
            </FormField>
            <FormField label="Cost per Unit (₹)">
              <input type="number" min="0" step="0.01" value={form.cost_per_unit}
                onChange={e => setForm(p => ({ ...p, cost_per_unit: e.target.value }))}
                placeholder="0.00" className="input" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Current Stock">
              <input type="number" min="0" step="0.01" value={form.current_stock}
                onChange={e => setForm(p => ({ ...p, current_stock: e.target.value }))}
                placeholder="0" className="input" />
            </FormField>
            <FormField label="Minimum Stock">
              <input type="number" min="0" step="0.01" value={form.minimum_stock}
                onChange={e => setForm(p => ({ ...p, minimum_stock: e.target.value }))}
                placeholder="0" className="input" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={modal === 'adjust'} onClose={() => setModal(null)}
        title={`Adjust Stock — ${selected?.ingredient_name}`}>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            Current stock: <strong>{selected?.current_stock} {selected?.unit}</strong>
          </div>
          <FormField label="Adjustment Type">
            <div className="flex gap-2">
              {[{ key: 'add', label: '+ Add Stock' }, { key: 'remove', label: '− Remove Stock' }].map(t => (
                <button key={t.key} onClick={() => setAdjForm(p => ({ ...p, type: t.key }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    adjForm.type === t.key
                      ? t.key === 'add' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                      : 'border-gray-200 text-gray-600'
                  }`}>{t.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label={`Quantity (${selected?.unit})`}>
            <input type="number" min="0.01" step="0.01" value={adjForm.qty}
              onChange={e => setAdjForm(p => ({ ...p, qty: e.target.value }))}
              placeholder="0" className="input" />
          </FormField>
          <FormField label="Note (optional)">
            <input type="text" value={adjForm.note}
              onChange={e => setAdjForm(p => ({ ...p, note: e.target.value }))}
              placeholder="Reason for adjustment…" className="input" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveAdjust} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
