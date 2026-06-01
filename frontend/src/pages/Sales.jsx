import { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, fmtTime, today } from '../utils/fmt'
import { downloadCsv, downloadTemplate } from '../utils/csv'
import { Modal, Empty, Spinner, FormField, PaymentBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const MODES = ['Cash','UPI','Card','Bank Transfer']
const empty = { shop_id:'', total:'', payment_mode:'Cash', notes:'', sale_date:today(), sale_time:'' }
const SALES_TEMPLATE_HEADERS = ['Date','Time','Shop','Total','Mode']

const splitCsvLine = (line) => {
  const values = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"' && quoted && next === '"') {
      current += '"'
      i += 1
    } else if (ch === '"') {
      quoted = !quoted
    } else if (ch === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current.trim())
  return values
}

const parseCsvPreview = (text) => {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map(h=>h.trim().toLowerCase())
  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line)
    const row = { row: index + 2 }
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    })
    return row
  })
}

export default function Sales() {
  const { user } = useAuth()
  const isAdmin = ['admin','superadmin'].includes(user?.role)
  const isEmployee = user?.role === 'employee'
  const fileRef = useRef(null)
  const [rows, setRows] = useState([])
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState(null)
  const [filters, setFilters] = useState({ date:'', shop_id:'', mode:'' })
  const [summary, setSummary] = useState(null)
  const [csvFile, setCsvFile] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [importResult, setImportResult] = useState(null)

  const loadShops = async () => {
    const { data } = await api.get('/shops')
    const available = isEmployee && user?.shop_id ? data.filter(s => s.id === user.shop_id) : data
    setShops(available)
    if (!form.shop_id && available[0]) setForm(p => ({ ...p, shop_id: available[0].id }))
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.date) params.date = filters.date
      if (isEmployee) params.shop_id = user?.shop_id || undefined
      else if (filters.shop_id) params.shop_id = filters.shop_id
      if (filters.mode) params.mode = filters.mode
      const [r, s] = await Promise.all([
        api.get('/sales', { params }),
        api.get('/sales/summary', { params: { period:'day', date:today(), shop_id: params.shop_id } })
      ])
      setRows(r.data)
      setSummary(s.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    loadShops()
    load()
  }, [user])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...empty, shop_id: isEmployee ? user?.shop_id || '' : shops[0]?.id || '' })
    setErr('')
    setModal(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      shop_id: r.shop_id || '',
      total: r.total_amount,
      payment_mode: r.payment_mode,
      notes: r.notes || '',
      sale_date: r.sale_date?.slice(0,10) || today(),
      sale_time: r.sale_time?.slice(0,5) || '',
    })
    setErr('')
    setModal(true)
  }

  const save = async () => {
    setErr('')
    setSaving(true)
    try {
      if (!form.shop_id || !form.total || !form.payment_mode) {
        setErr('Shop, total and mode are required')
        return
      }
      if (editing) await api.put(`/sales/${editing.id}`, form)
      else await api.post('/sales', form)
      setNotice({ type:'success', text: editing ? 'Sale updated successfully.' : 'Sale added successfully.' })
      setModal(false)
      load()
    } catch(e) {
      setErr(e.response?.data?.error||'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const del = async (id) => {
    if (!confirm('Delete this sale?')) return
    await api.delete(`/sales/${id}`)
    setNotice({ type:'success', text:'Sale deleted successfully.' })
    load()
  }

  const handleCsvFile = async (file) => {
    if (!file) return
    setCsvFile(file)
    setImportResult(null)
    setErr('')
    const text = await file.text()
    setPreviewRows(parseCsvPreview(text).slice(0, 20))
  }

  const importCsv = async () => {
    if (!csvFile) {
      setErr('Choose a CSV file first.')
      return
    }
    setImporting(true)
    setErr('')
    try {
      const data = new FormData()
      data.append('file', csvFile)
      const res = await api.post('/sales/import', data)
      setImportResult(res.data)
      setNotice({
        type: res.data.failed_rows ? 'warning' : 'success',
        text: `CSV import complete. Imported ${res.data.imported_rows} of ${res.data.total_rows} rows.`,
      })
      setConfirmImport(false)
      loadShops()
      load()
    } catch(e) {
      setNotice({ type:'error', text:e.response?.data?.error || 'CSV import failed.' })
    } finally {
      setImporting(false)
    }
  }

  const closeImport = () => {
    setImportModal(false)
    setConfirmImport(false)
    setCsvFile(null)
    setPreviewRows([])
    setImportResult(null)
    setErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const f = (k,v) => setForm(p=>({...p,[k]:v}))
  const downloadSalesTemplate = () => downloadTemplate('sales-import-template.csv', SALES_TEMPLATE_HEADERS, {
    Date: '2026-06-01',
    Time: '09:15',
    Shop: 'Main Branch',
    Total: '160',
    Mode: 'Cash',
  })
  const downloadSalesHistory = () => downloadCsv('sales-history.csv', SALES_TEMPLATE_HEADERS,
    rows.map(r => ({
      Date: r.sale_date?.slice(0,10),
      Time: r.sale_time?.slice(0,5),
      Shop: r.shop_name || '',
      Total: r.total_amount,
      Mode: r.payment_mode,
    }))
  )

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold flex items-center justify-between ${
          notice.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' :
          notice.type === 'warning' ? 'bg-[#fff0b0] border-[#FFC300] text-[#7a5400]' :
          'bg-green-50 border-green-100 text-green-700'
        }`}>
          <span>{notice.text}</span>
          <button onClick={()=>setNotice(null)} className="text-current opacity-60 hover:opacity-100">Close</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500">Track sales by shop, payment mode and date.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadSalesTemplate} className="btn-secondary">Download Template</button>
          <button onClick={downloadSalesHistory} className="btn-secondary" disabled={!rows.length}>Download History</button>
          {!isEmployee && <button onClick={()=>setImportModal(true)} className="btn-accent">Import CSV</button>}
          <button onClick={openAdd} className="btn-primary">Add Sale</button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Today Sales', fmt(summary.total_sales), 'TS'],
            ['Entries', summary.total_orders, 'EN'],
            ['Avg Entry', fmt(summary.avg_order), 'AV'],
            ['UPI', fmt(summary.upi), 'UP'],
          ].map(([l,v,ic]) => (
            <div key={l} className="card p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md">
              <span className="w-10 h-10 rounded-lg bg-[#fff0b0] text-[#7a5400] flex items-center justify-center text-xs font-black">{ic}</span>
              <div><div className="text-xs text-gray-500 font-bold uppercase">{l}</div><div className="font-black text-gray-900">{v}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 flex flex-wrap gap-3">
        <input type="date" value={filters.date} onChange={e=>setFilters(p=>({...p,date:e.target.value}))} className="input w-40"/>
        {!isEmployee && (
          <select value={filters.shop_id} onChange={e=>setFilters(p=>({...p,shop_id:e.target.value}))} className="input w-52">
            <option value="">All Shops</option>
            {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select value={filters.mode} onChange={e=>setFilters(p=>({...p,mode:e.target.value}))} className="input w-40">
          <option value="">All Modes</option>
          {MODES.map(m=><option key={m}>{m}</option>)}
        </select>
        <button onClick={load} className="btn-primary px-4">Filter</button>
        <button onClick={()=>{ setFilters({date:'',shop_id:'',mode:''}); setTimeout(load,0) }} className="btn-secondary">Clear</button>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner/> : rows.length === 0 ? <Empty/> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-red-100">
                <tr>
                  {['Code','Date','Time','Shop','Total','Mode','By',''].map(h=>(
                    <th key={h} className="table-header text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r=>(
                  <tr key={r.id} className="hover:bg-[#fff8ed] transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-500">{r.sale_code}</td>
                    <td className="table-cell whitespace-nowrap">{fmtDate(r.sale_date)}</td>
                    <td className="table-cell">{fmtTime(r.sale_time)}</td>
                    <td className="table-cell font-semibold text-gray-900">{r.shop_name}</td>
                    <td className="table-cell font-bold text-[#D62828]">{fmt(r.total_amount)}</td>
                    <td className="table-cell"><PaymentBadge mode={r.payment_mode}/></td>
                    <td className="table-cell text-xs text-gray-400">{r.created_by_name}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button onClick={()=>openEdit(r)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                        {isAdmin && <button onClick={()=>del(r.id)} className="text-xs font-semibold text-red-600 hover:underline">Del</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing?'Edit Sale':'Add Sale'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <input type="date" value={form.sale_date} onChange={e=>f('sale_date',e.target.value)} className="input"/>
            </FormField>
            <FormField label="Time">
              <input type="time" value={form.sale_time} onChange={e=>f('sale_time',e.target.value)} className="input"/>
            </FormField>
          </div>
          <FormField label="Shop">
            <select value={form.shop_id} onChange={e=>f('shop_id',e.target.value)} className="input" disabled={isEmployee}>
              {!isEmployee && <option value="">Select shop</option>}
              {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {isEmployee && user?.shop_id && (
              <p className="text-xs text-gray-500 mt-1">Assigned shop access only</p>
            )}
          </FormField>
          <FormField label="Total">
            <input type="number" min="0" step="0.01" value={form.total} onChange={e=>f('total',e.target.value)} className="input"/>
          </FormField>
          <FormField label="Mode">
            <select value={form.payment_mode} onChange={e=>f('payment_mode',e.target.value)} className="input">
              {MODES.map(m=><option key={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label="Notes (optional)">
            <textarea value={form.notes} onChange={e=>f('notes',e.target.value)} rows={2} className="input resize-none"/>
          </FormField>
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':'Save Sale'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={importModal} onClose={closeImport} title="Import Sales CSV" wide>
        <div className="space-y-5">
          <div
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>{ e.preventDefault(); handleCsvFile(e.dataTransfer.files?.[0]) }}
            className="border-2 border-dashed border-red-200 bg-[#fff8ed] rounded-lg p-6 text-center hover:border-[#D62828] transition-colors"
          >
            <div className="text-lg font-black text-gray-900">Drop your CSV file here</div>
            <p className="text-sm text-gray-500 mt-1">Required columns: Date, Time, Shop, Total, Mode</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e=>handleCsvFile(e.target.files?.[0])} className="hidden"/>
            <button type="button" onClick={()=>fileRef.current?.click()} className="btn-secondary mt-4">Choose File</button>
            {csvFile && <div className="text-sm font-semibold text-[#D62828] mt-3">{csvFile.name}</div>}
          </div>

          {previewRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Preview Records</h3>
                <span className="badge-yellow">Showing {previewRows.length} rows</span>
              </div>
              <div className="overflow-x-auto border border-red-100 rounded-lg">
                <table className="w-full">
                  <thead>
                    <tr>{['Row','Date','Time','Shop','Total','Mode'].map(h=><th key={h} className="table-header text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map(r=>(
                      <tr key={r.row} className="hover:bg-[#fff8ed]">
                        <td className="table-cell">{r.row}</td>
                        <td className="table-cell">{r.date}</td>
                        <td className="table-cell">{r.time}</td>
                        <td className="table-cell">{r.shop}</td>
                        <td className="table-cell font-semibold">{r.total}</td>
                        <td className="table-cell">{r.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-3"><div className="label">Total Rows</div><div className="text-xl font-black">{importResult.total_rows}</div></div>
              <div className="card p-3"><div className="label">Imported</div><div className="text-xl font-black text-green-700">{importResult.imported_rows}</div></div>
              <div className="card p-3"><div className="label">Failed</div><div className="text-xl font-black text-red-700">{importResult.failed_rows}</div></div>
            </div>
          )}

          {importResult?.failures?.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700">
              {importResult.failures.slice(0, 5).map(f => <div key={`${f.row}-${f.error}`}>Row {f.row}: {f.error}</div>)}
            </div>
          )}

          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex flex-wrap justify-end gap-3">
            <button onClick={closeImport} className="btn-secondary">Close</button>
            <button disabled={!csvFile || importing} onClick={()=>setConfirmImport(true)} className="btn-primary disabled:opacity-50">
              {importing ? 'Importing...' : 'Review and Import'}
            </button>
          </div>

          {importing && <div className="h-2 bg-yellow-100 rounded-full overflow-hidden"><div className="h-full w-2/3 bg-[#D62828] rounded-full animate-pulse"/></div>}
        </div>
      </Modal>

      <Modal open={confirmImport} onClose={()=>setConfirmImport(false)} title="Confirm CSV Import">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Import {csvFile?.name} into the existing sales table? Valid rows will be inserted in one database transaction.</p>
          <div className="bg-[#fff8ed] border border-red-100 rounded-lg p-3 text-sm">
            Rows previewed: <span className="font-bold">{previewRows.length}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={()=>setConfirmImport(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={importCsv} disabled={importing} className="btn-primary flex-1">{importing ? 'Importing...' : 'Confirm Import'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
