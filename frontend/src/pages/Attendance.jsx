import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmtTime, today, thisMonth } from '../utils/fmt'
import { Spinner, Empty, Modal, Badge, FormField } from '../components/ui'

const STATUS_OPTS = ['present', 'absent', 'half_day']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_NUMS = ['01','02','03','04','05','06','07','08','09','10','11','12']

const statusColor = (s) => {
  if (s === 'present')  return 'bg-green-100 text-green-700'
  if (s === 'half_day') return 'bg-yellow-100 text-yellow-700'
  if (s === 'absent')   return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-400'
}

export default function Attendance() {
  const [tab, setTab]             = useState('daily')   // 'daily' | 'monthly' | 'grid'
  const [date, setDate]           = useState(today())
  const [month, setMonth]         = useState(thisMonth())
  const [gridYear, setGridYear]   = useState(new Date().getFullYear().toString())

  const [records, setRecords]     = useState([])
  const [summary, setSummary]     = useState([])
  const [grid, setGrid]           = useState([])        // yearly grid data
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)

  const [bulkMode, setBulkMode]         = useState(false)
  const [bulkData, setBulkData]         = useState({})
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({ status: 'present', check_in: '', check_out: '', half_day_reason: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState('')

  // ── load ─────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      if (tab === 'daily') {
        const [attRes, empRes] = await Promise.all([
          api.get('/attendance', { params: { date } }),
          api.get('/employees', { params: { status: 'active' } }),
        ])
        setRecords(attRes.data)
        setEmployees(empRes.data)
      } else if (tab === 'monthly') {
        const res = await api.get('/attendance/summary', { params: { month } })
        setSummary(res.data)
      } else {
        const res = await api.get('/attendance/grid', { params: { year: gridYear } })
        setGrid(res.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, date, month, gridYear])

  // ── daily helpers ─────────────────────────────────────────────────────────
  const attMap = {}
  records.forEach(r => { attMap[r.employee_id] = r })

  const rows = employees
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.emp_code.toLowerCase().includes(search.toLowerCase()))
    .map(e => ({ ...e, att: attMap[e.id] || null }))

  const openEdit = (emp, att) => {
    setModal({ emp_id: emp.id, emp_name: emp.name, att })
    setForm({
      status: att?.status || 'present',
      check_in: att?.check_in || '',
      check_out: att?.check_out || '',
      half_day_reason: att?.half_day_reason || '',
    })
  }

  const saveAttendance = async () => {
    setSaving(true)
    try {
      await api.post('/attendance/manual', {
        employee_id: modal.emp_id,
        att_date: date,
        status: form.status,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        half_day_reason: form.half_day_reason || null,
      })
      setModal(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const initBulk = () => {
    const init = {}
    employees.forEach(e => {
      init[e.id] = {
        status: attMap[e.id]?.status || 'present',
        check_in: attMap[e.id]?.check_in || '',
        check_out: attMap[e.id]?.check_out || '',
      }
    })
    setBulkData(init)
    setBulkMode(true)
  }

  const submitBulk = async () => {
    setBulkSubmitting(true)
    try {
      const records = Object.entries(bulkData).map(([id, d]) => ({
        employee_id: id, status: d.status,
        check_in: d.check_in || null, check_out: d.check_out || null,
      }))
      await api.post('/attendance/bulk', { att_date: date, records })
      setBulkMode(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Bulk save failed')
    } finally {
      setBulkSubmitting(false)
    }
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCsv = async () => {
    try {
      const res = await api.get('/attendance/export-csv', {
        params: { year: gridYear },
        responseType: 'blob'
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${gridYear}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err.response?.data?.error || err.message))
    }
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportErr('')
    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

      const csvRows = []
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const empCode = values[0]
        if (!empCode) continue

        const months = {}
        // Header pattern: "Jan Present", "Jan Half Day", "Jan Absent", ...
        MONTHS.forEach((mName, idx) => {
          const mn = MONTH_NUMS[idx]
          const pIdx = header.indexOf(`${mName} Present`)
          const hIdx = header.indexOf(`${mName} Half Day`)
          const aIdx = header.indexOf(`${mName} Absent`)
          months[mn] = {
            present:  pIdx >= 0 ? (parseInt(values[pIdx])  || 0) : 0,
            half_day: hIdx >= 0 ? (parseInt(values[hIdx]) || 0) : 0,
            absent:   aIdx >= 0 ? (parseInt(values[aIdx])  || 0) : 0,
          }
        })
        csvRows.push({ emp_code: empCode, months })
      }

      const res = await api.post('/attendance/import-csv', { year: gridYear, rows: csvRows })
      const { imported, failures } = res.data
      let msg = `Imported ${imported} attendance records.`
      if (failures.length > 0) {
        msg += `\n${failures.length} employees not found:\n` + failures.map(f => `${f.emp_code}: ${f.error}`).join('\n')
      }
      alert(msg)
      load()
    } catch (err) {
      setImportErr(err.response?.data?.error || err.message)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = tab === 'daily' ? {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    half:    records.filter(r => r.status === 'half_day').length,
    total:   employees.length,
  } : null

  // ── grid cell helper ───────────────────────────────────────────────────────
  const GridCell = ({ data }) => {
    if (!data || (data.present === 0 && data.half_day === 0 && data.absent === 0)) {
      return <span className="text-xs text-gray-300">—</span>
    }
    return (
      <div className="text-xs leading-tight space-y-0.5">
        {data.present  > 0 && <div className="text-green-600 font-semibold">{data.present}P</div>}
        {data.half_day > 0 && <div className="text-yellow-600">{data.half_day}H</div>}
        {data.absent   > 0 && <div className="text-red-500">{data.absent}A</div>}
      </div>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{color:'var(--ink)'}}>Attendance</h1>
          <p className="text-sm mt-0.5" style={{color:'var(--muted)'}}>Track employee attendance daily, monthly, or yearly</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === 'grid' && (
            <>
              <button onClick={exportCsv} className="btn-secondary">⬇ Export CSV</button>
              <label className={`btn-secondary cursor-pointer ${importing ? 'opacity-50' : ''}`}>
                {importing ? 'Importing…' : '⬆ Import CSV'}
                <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
              </label>
            </>
          )}
          {tab === 'daily' && !bulkMode && (
            <button onClick={initBulk} className="btn-primary flex items-center gap-2">
              <span>📋</span> Bulk Mark
            </button>
          )}
          {bulkMode && (
            <>
              <button onClick={() => setBulkMode(false)} className="btn-secondary">Cancel</button>
              <button onClick={submitBulk} disabled={bulkSubmitting} className="btn-primary">
                {bulkSubmitting ? 'Saving…' : '💾 Save All'}
              </button>
            </>
          )}
        </div>
      </div>

      {importErr && (
        <div className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2">{importErr}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {['daily', 'monthly', 'grid'].map(t => (
          <button key={t} onClick={() => { setTab(t); setBulkMode(false) }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'grid' ? '📊 Yearly Grid' : t}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {tab === 'daily' && (
          <>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            <input type="text" placeholder="Search employee…" value={search}
              onChange={e => setSearch(e.target.value)} className="input w-48" />
          </>
        )}
        {tab === 'monthly' && (
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-auto" />
        )}
        {tab === 'grid' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" style={{color:'var(--muted)'}}>Year:</label>
            <select value={gridYear} onChange={e => setGridYear(e.target.value)} className="input w-28">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500">
              P = Present · H = Half Day · A = Absent
            </span>
          </div>
        )}
      </div>

      {/* Daily stat pills */}
      {tab === 'daily' && stats && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Total',    value: stats.total,                                      color: 'bg-gray-100 text-gray-700' },
            { label: 'Present',  value: stats.present,                                    color: 'bg-green-100 text-green-700' },
            { label: 'Absent',   value: stats.absent,                                     color: 'bg-red-100 text-red-700' },
            { label: 'Half Day', value: stats.half,                                       color: 'bg-yellow-100 text-yellow-700' },
            { label: 'Unmarked', value: stats.total - stats.present - stats.absent - stats.half, color: 'bg-orange-100 text-orange-700' },
          ].map(s => (
            <div key={s.label} className={`${s.color} px-4 py-2 rounded-xl text-sm font-semibold`}>
              {s.label}: {s.value}
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {/* ── Daily View ── */}
          {tab === 'daily' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header text-left">Employee</th>
                      <th className="table-header text-left">Designation</th>
                      <th className="table-header">Status</th>
                      <th className="table-header">Check In</th>
                      <th className="table-header">Check Out</th>
                      <th className="table-header">Hours</th>
                      {!bulkMode && <th className="table-header">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 && (
                      <tr><td colSpan={7}><Empty msg="No employees found" /></td></tr>
                    )}
                    {rows.map(emp => (
                      <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="table-cell">
                          <div className="font-semibold" style={{color:'var(--ink)'}}>{emp.name}</div>
                          <div className="text-xs" style={{color:'var(--muted)'}}>{emp.emp_code}</div>
                        </td>
                        <td className="table-cell" style={{color:'var(--muted)'}}>{emp.designation || '—'}</td>
                        <td className="table-cell text-center">
                          {bulkMode ? (
                            <select value={bulkData[emp.id]?.status || 'present'}
                              onChange={e => setBulkData(p => ({ ...p, [emp.id]: { ...p[emp.id], status: e.target.value } }))}
                              className="input text-xs py-1 w-28">
                              {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                            </select>
                          ) : (
                            emp.att ? <Badge status={emp.att.status} /> : <span className="badge-gray">Unmarked</span>
                          )}
                        </td>
                        <td className="table-cell text-center" style={{color:'var(--muted)'}}>
                          {bulkMode ? (
                            <input type="time" value={bulkData[emp.id]?.check_in || ''}
                              onChange={e => setBulkData(p => ({ ...p, [emp.id]: { ...p[emp.id], check_in: e.target.value } }))}
                              className="input text-xs py-1 w-28" />
                          ) : fmtTime(emp.att?.check_in)}
                        </td>
                        <td className="table-cell text-center" style={{color:'var(--muted)'}}>
                          {bulkMode ? (
                            <input type="time" value={bulkData[emp.id]?.check_out || ''}
                              onChange={e => setBulkData(p => ({ ...p, [emp.id]: { ...p[emp.id], check_out: e.target.value } }))}
                              className="input text-xs py-1 w-28" />
                          ) : fmtTime(emp.att?.check_out)}
                        </td>
                        <td className="table-cell text-center" style={{color:'var(--muted)'}}>
                          {emp.att?.working_hours != null ? `${emp.att.working_hours}h` : '—'}
                        </td>
                        {!bulkMode && (
                          <td className="table-cell text-center">
                            <button onClick={() => openEdit(emp, emp.att)}
                              className="text-orange-500 hover:text-orange-700 text-xs font-semibold transition-colors">
                              {emp.att ? 'Edit' : 'Mark'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Monthly Summary View ── */}
          {tab === 'monthly' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header text-left">Employee</th>
                      <th className="table-header">Present</th>
                      <th className="table-header">Half Days</th>
                      <th className="table-header">Absent</th>
                      <th className="table-header">Avg Hours</th>
                      <th className="table-header text-right">Salary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.length === 0 && (
                      <tr><td colSpan={6}><Empty msg="No attendance data for this month" /></td></tr>
                    )}
                    {summary.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="table-cell">
                          <div className="font-semibold" style={{color:'var(--ink)'}}>{s.name}</div>
                          <div className="text-xs" style={{color:'var(--muted)'}}>{s.emp_code} · {s.designation || '—'}</div>
                        </td>
                        <td className="table-cell text-center"><span className="badge-green">{s.present_days}</span></td>
                        <td className="table-cell text-center"><span className="badge-yellow">{s.half_days}</span></td>
                        <td className="table-cell text-center"><span className="badge-red">{s.absent_days}</span></td>
                        <td className="table-cell text-center text-gray-500">{s.avg_hours ? `${s.avg_hours}h` : '—'}</td>
                        <td className="table-cell text-right font-semibold text-gray-700">
                          ₹{Number(s.monthly_salary).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Yearly Grid View ── */}
          {tab === 'grid' && (
            <div className="card overflow-hidden">
              {grid.length === 0 ? (
                <Empty msg="No attendance data for this year" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-header text-left sticky left-0 bg-gray-50 z-10 min-w-[160px]">Employee</th>
                        {MONTHS.map(m => (
                          <th key={m} className="table-header text-center min-w-[70px]">{m}</th>
                        ))}
                        <th className="table-header text-center min-w-[80px]">Total P</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {grid.map(emp => {
                        const totalPresent = MONTH_NUMS.reduce((sum, mn) => {
                          const m = emp.months[mn]
                          return sum + (m ? m.present + (m.half_day * 0.5) : 0)
                        }, 0)

                        return (
                          <tr key={emp.employee_id} className="hover:bg-orange-50/30 transition-colors">
                            <td className="table-cell sticky left-0 bg-white z-10">
                              <div className="font-semibold" style={{color:'var(--ink)'}}>{emp.employee_name}</div>
                              <div className="text-xs" style={{color:'var(--muted)'}}>{emp.emp_code} · {emp.designation || '—'}</div>
                            </td>
                            {MONTH_NUMS.map(mn => (
                              <td key={mn} className="table-cell text-center">
                                <GridCell data={emp.months[mn]} />
                              </td>
                            ))}
                            <td className="table-cell text-center">
                              <span className="font-bold text-orange-600">{totalPresent}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="p-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs" style={{color:'var(--muted)'}}>
                  Use <strong>Export CSV</strong> to download this grid · <strong>Import CSV</strong> to bulk-upload using the same format
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mark/Edit Attendance Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)}
        title={`${modal?.att ? 'Edit' : 'Mark'} Attendance — ${modal?.emp_name}`}>
        <div className="space-y-4">
          <FormField label="Status">
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTS.map(s => (
                <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                    form.status === s
                      ? s === 'present'  ? 'bg-green-500 text-white border-green-500'
                        : s === 'absent' ? 'bg-red-500 text-white border-red-500'
                        : 'bg-yellow-400 text-white border-yellow-400'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check In">
              <input type="time" value={form.check_in}
                onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Check Out">
              <input type="time" value={form.check_out}
                onChange={e => setForm(p => ({ ...p, check_out: e.target.value }))} className="input" />
            </FormField>
          </div>

          {form.status === 'half_day' && (
            <FormField label="Half Day Reason">
              <input type="text" value={form.half_day_reason}
                onChange={e => setForm(p => ({ ...p, half_day_reason: e.target.value }))}
                placeholder="Reason…" className="input" />
            </FormField>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveAttendance} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
