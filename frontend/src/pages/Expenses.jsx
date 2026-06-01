import { useEffect, useState, useRef } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, today } from '../utils/fmt'
import { downloadCsv, parseCsvFile } from '../utils/csv'
import { Modal, Empty, Spinner, FormField } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const DEFAULT_EMOJIS = {
  'Gas': '🔥', 'Electricity': '⚡', 'Eggs': '🥚', 'Chicken': '🍗', 'Oil': '🛢️',
  'Flour': '🌾', 'Vegetables': '🥬', 'Rent': '🏠', 'Internet': '📡',
  'Staff Food': '🍽️', 'Miscellaneous': '📦'
}
const getCatEmoji = (cat) => DEFAULT_EMOJIS[cat] || '📁'

export default function Expenses() {
  const { user } = useAuth()
  const isAdmin = ['admin', 'superadmin'].includes(user?.role)

  const [rows, setRows]           = useState([])
  const [summary, setSummary]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState(null)
  const [expandedCat, setExpandedCat] = useState(null)
  const [filterDate, setFilterDate] = useState(today())
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  // New-category input state inside the modal
  const [newCatMode, setNewCatMode] = useState(false)
  const [newCatInput, setNewCatInput] = useState('')

  const emptyForm = {
    category: '', quantity: '', unit: '', unit_price: '',
    amount: '', expense_date: today(), is_paid: false, notes: ''
  }
  const [form, setForm]   = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  // ── loaders ──────────────────────────────────────────────────────────────
  const loadCategories = async () => {
    try {
      const { data } = await api.get('/expenses/categories')
      setCategories(data)
      return data
    } catch (e) {
      console.error('Failed to load categories', e)
      return []
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateFrom) params.from = dateFrom
      if (dateTo)   params.to   = dateTo
      const [r, s, cats] = await Promise.all([
        api.get('/expenses', { params }),
        api.get('/expenses/summary', { params: { date: filterDate } }),
        loadCategories()
      ])
      setRows(r.data)
      setSummary(s.data)
    } catch (e) {
      console.error('Load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterDate, dateFrom, dateTo])

  // ── helpers ───────────────────────────────────────────────────────────────
  // Build category list from fetched categories PLUS any in-db rows that
  // may not yet be in the categories list (edge case safety)
  const allCategories = Array.from(
    new Set([...categories, ...rows.map(r => r.category)])
  ).sort()

  const groupByCategory = () => {
    const grouped = {}
    allCategories.forEach(cat => { grouped[cat] = [] })
    rows.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = []
      grouped[r.category].push(r)
    })
    return grouped
  }

  const getSummary = (cat) => {
    const s = summary.find(s => s.category === cat)
    return s || { category: cat, total_month: 0, pending_amount: 0 }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── modal open ────────────────────────────────────────────────────────────
  const openAdd = (category = '') => {
    setEditing(null)
    setNewCatMode(false)
    setNewCatInput('')
    setForm({ ...emptyForm, category: category || (categories[0] || '') })
    setErr('')
    setModal(true)
  }

  const openEdit = (expense) => {
    setEditing(expense)
    setNewCatMode(false)
    setNewCatInput('')
    setForm({
      category:     expense.category,
      quantity:     expense.quantity    || '',
      unit:         expense.unit        || '',
      unit_price:   expense.unit_price  || '',
      amount:       expense.amount      || '',
      expense_date: expense.expense_date?.slice(0, 10) || today(),
      is_paid:      expense.is_paid     || false,
      notes:        expense.notes       || ''
    })
    setErr('')
    setModal(true)
  }

  // ── save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    setErr('')

    // Resolve final category name
    let finalCategory = newCatMode ? newCatInput.trim() : form.category
    if (!finalCategory) { setErr('Category is required'); return }
    if (!form.amount)   { setErr('Amount is required');   return }

    setSaving(true)
    try {
      const payload = { ...form, category: finalCategory }
      if (editing) {
        await api.put(`/expenses/${editing.id}`, payload)
      } else {
        await api.post('/expenses', payload)
      }
      setModal(false)
      // Re-fetch categories so the new one appears immediately
      await load()
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── other actions ─────────────────────────────────────────────────────────
  const togglePaid = async (expense) => {
    try {
      await api.patch(`/expenses/${expense.id}/paid`, { paid: !expense.is_paid })
      load()
    } catch (e) {
      alert('Failed to update: ' + (e.response?.data?.error || e.message))
    }
  }

  const del = async (id) => {
    if (!confirm('Delete this expense?')) return
    try {
      await api.delete(`/expenses/${id}`)
      load()
    } catch (e) {
      alert('Delete failed: ' + (e.response?.data?.error || e.message))
    }
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await parseCsvFile(file)
      const lines = text.trim().split('\n')
      const header = lines[0].split(',').map(h => h.trim())
      const validRows = []
      const errors = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim())
        const row = {}
        header.forEach((h, idx) => { row[h] = values[idx] || '' })

        if (!row.Category) { errors.push(`Row ${i}: Missing category`); continue }
        if (!row.Date)     { errors.push(`Row ${i}: Missing date`);     continue }
        if (!row.Total)    { errors.push(`Row ${i}: Missing total`);    continue }

        validRows.push({
          category:     row.Category,
          quantity:     row.Quantity  || null,
          unit:         row.Unit      || null,
          unit_price:   row.UnitPrice ? parseFloat(row.UnitPrice) : null,
          amount:       parseFloat(row.Total),
          expense_date: row.Date,
          is_paid:      row.Paid === '1',
          notes:        row.Notes || ''
        })
      }

      if (errors.length > 0) {
        alert(`${errors.length} rows had errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n…' : ''}`)
      }

      if (validRows.length > 0) {
        for (const v of validRows) { await api.post('/expenses', v) }
        alert(`Imported ${validRows.length} expenses`)
        load()
      }
    } catch (err) {
      alert('Import failed: ' + err.message)
    }
    e.target.value = ''
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  const makeDownloadTemplate = () => {
    const headers = ['Category', 'Date', 'Quantity', 'Unit', 'UnitPrice', 'Total', 'Paid', 'Notes']
    const example = { Category: categories[0] || 'Gas', Date: today(), Quantity: 2, Unit: 'Cylinders', UnitPrice: 1200, Total: 2400, Paid: '1', Notes: '' }
    downloadCsv('expenses-template.csv', headers, [example])
  }

  const exportCategory = (category) => {
    const catRows = rows.filter(r => r.category === category)
    const headers = ['Code', 'Category', 'Date', 'Quantity', 'Unit', 'UnitPrice', 'Total', 'Paid']
    const data = catRows.map(r => ({
      Code: r.expense_code, Category: r.category,
      Date: r.expense_date?.slice(0, 10), Quantity: r.quantity || '',
      Unit: r.unit || '', UnitPrice: r.unit_price || '',
      Total: r.amount, Paid: r.is_paid ? '1' : '0'
    }))
    downloadCsv(`expenses-${category.toLowerCase().replace(/\s+/g, '-')}.csv`, headers, data)
  }

  const exportAll = () => {
    const headers = ['Code', 'Category', 'Date', 'Quantity', 'Unit', 'UnitPrice', 'Total', 'Paid', 'Notes']
    const data = rows.map(r => ({
      Code: r.expense_code, Category: r.category,
      Date: r.expense_date?.slice(0, 10), Quantity: r.quantity || '',
      Unit: r.unit || '', UnitPrice: r.unit_price || '',
      Total: r.amount, Paid: r.is_paid ? '1' : '0', Notes: r.notes || ''
    }))
    downloadCsv('expenses-all.csv', headers, data)
  }

  const grouped = groupByCategory()

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>🏪 Expense Tracker</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Manage fast-food business expenses by category</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary cursor-pointer">
            Import CSV
            <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={makeDownloadTemplate} className="btn-secondary">Download Template</button>
          <button onClick={exportAll} className="btn-secondary" disabled={!rows.length}>Export All</button>
          <button onClick={() => openAdd()} className="btn-primary">+ Add Expense</button>
        </div>
      </div>

      {/* Date Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Monthly summary date</label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="input w-40" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-40" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-40" />
        </div>
        <button
          onClick={() => { setDateFrom(''); setDateTo('') }}
          className="btn-secondary self-end"
        >Clear</button>
      </div>

      {/* Body */}
      {loading ? (
        <Spinner />
      ) : allCategories.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {allCategories.map(cat => {
            const catExpenses = grouped[cat] || []
            const catSummary  = getSummary(cat)
            const isExpanded  = expandedCat === cat
            const total   = Number(catSummary.total_month)   || 0
            const pending = Number(catSummary.pending_amount) || 0

            return (
              <div key={cat} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedCat(isExpanded ? null : cat)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{getCatEmoji(cat)}</span>
                    <div className="flex-1 text-left">
                      <h3 className="font-bold" style={{ color: 'var(--ink)' }}>{cat}</h3>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        ₹{fmt(total)} this month
                        {pending > 0 && ` • Pending ₹${fmt(pending)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold">
                      {catExpenses.length}
                    </span>
                    <span className="text-xl" style={{ color: 'var(--muted)' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {catExpenses.length === 0 ? (
                      <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>No expenses yet</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs font-semibold">
                            <tr>
                              <th className="table-header text-left">Date</th>
                              <th className="table-header text-left">Qty</th>
                              <th className="table-header text-left">Unit</th>
                              <th className="table-header text-right">Unit Price</th>
                              <th className="table-header text-right">Total</th>
                              <th className="table-header text-center">Paid</th>
                              <th className="table-header text-left">Notes</th>
                              <th className="table-header text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {catExpenses.map(exp => (
                              <tr key={exp.id} className="hover:bg-gray-50">
                                <td className="table-cell" style={{ color: 'var(--ink)' }}>{exp.expense_date?.slice(0, 10)}</td>
                                <td className="table-cell text-right">{exp.quantity || '—'}</td>
                                <td className="table-cell">{exp.unit || '—'}</td>
                                <td className="table-cell text-right" style={{ color: 'var(--muted)' }}>
                                  {exp.unit_price ? `₹${fmt(exp.unit_price)}` : '—'}
                                </td>
                                <td className="table-cell text-right font-bold" style={{ color: 'var(--ink)' }}>
                                  ₹{fmt(exp.amount)}
                                </td>
                                <td className="table-cell text-center">
                                  <button onClick={() => togglePaid(exp)} className="text-lg transition-transform">
                                    {exp.is_paid ? '✅' : '⬜'}
                                  </button>
                                </td>
                                <td className="table-cell text-xs max-w-xs truncate" style={{ color: 'var(--muted)' }}>
                                  {exp.notes || '—'}
                                </td>
                                <td className="table-cell text-center">
                                  <div className="flex gap-1 justify-center">
                                    {isAdmin && (
                                      <>
                                        <button onClick={() => openEdit(exp)} className="text-xs text-blue-600 hover:underline">Edit</button>
                                        <button onClick={() => del(exp.id)} className="text-xs text-red-500 hover:underline">Del</button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-between">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Category Total:</span>
                      <span className="font-bold" style={{ color: 'var(--ink)' }}>₹{fmt(total)}</span>
                    </div>
                    <div className="p-3 flex gap-2">
                      <button onClick={() => openAdd(cat)} className="btn-primary text-xs flex-1">+ Add</button>
                      <button onClick={() => exportCategory(cat)} className="btn-secondary text-xs flex-1">Export</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Expense' : 'Add Expense'}>
        <div className="space-y-4">

          {/* Category selector + new category toggle */}
          <FormField label="Category">
            {!newCatMode ? (
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={e => f('category', e.target.value)}
                  className="input flex-1"
                >
                  {categories.map(c => <option key={c} value={c}>{getCatEmoji(c)} {c}</option>)}
                </select>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setNewCatMode(true); setNewCatInput('') }}
                    className="btn-secondary text-xs whitespace-nowrap"
                    title="Create a new category"
                  >
                    + New
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  placeholder="New category name…"
                  maxLength={50}
                  className="input flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setNewCatMode(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Quantity">
              <input type="number" step="0.01" value={form.quantity}
                onChange={e => f('quantity', e.target.value)} placeholder="e.g. 2" className="input" />
            </FormField>
            <FormField label="Unit">
              <input type="text" value={form.unit}
                onChange={e => f('unit', e.target.value)} placeholder="e.g. Cylinders" className="input" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Unit Price (₹)">
              <input type="number" min="0" step="0.01" value={form.unit_price}
                onChange={e => f('unit_price', e.target.value)} placeholder="0.00" className="input" />
            </FormField>
            <FormField label="Total Amount (₹)">
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => f('amount', e.target.value)} placeholder="0.00" className="input" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <input type="date" value={form.expense_date}
                onChange={e => f('expense_date', e.target.value)} className="input" />
            </FormField>
            <FormField label="Paid?">
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={form.is_paid}
                  onChange={e => f('is_paid', e.target.checked)} className="w-4 h-4" />
                <span style={{ color: 'var(--ink)' }}>Mark as Paid</span>
              </label>
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)}
              rows={2} className="input resize-none" />
          </FormField>

          {err && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
