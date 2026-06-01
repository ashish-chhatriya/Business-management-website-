import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmtDate, fmtTime, today, thisMonth } from '../utils/fmt'
import { Spinner, Empty, Modal, Badge, FormField } from '../components/ui'

const STATUS_OPTS = ['present', 'absent', 'half_day']

export default function Attendance() {
  const [tab, setTab] = useState('daily')           // 'daily' | 'monthly'
  const [date, setDate] = useState(today())
  const [month, setMonth] = useState(thisMonth())
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkData, setBulkData] = useState({})       // { emp_id: { status, check_in, check_out } }
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [modal, setModal] = useState(null)           // { record } | null
  const [form, setForm] = useState({ status: 'present', check_in: '', check_out: '', half_day_reason: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

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
      } else {
        const res = await api.get('/attendance/summary', { params: { month } })
        setSummary(res.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, date, month])

  // Build a map of existing attendance by employee_id for daily view
  const attMap = {}
  records.forEach(r => { attMap[r.employee_id] = r })

  // For display: merge employees list with their attendance record
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
        employee_id: id,
        status: d.status,
        check_in: d.check_in || null,
        check_out: d.check_out || null,
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

  const stats = tab === 'daily'
    ? {
        present: records.filter(r => r.status === 'present').length,
        absent: records.filter(r => r.status === 'absent').length,
        half: records.filter(r => r.status === 'half_day').length,
        total: employees.length,
      }
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{color:'var(--ink)'}}>Attendance</h1>
          <p className="text-sm mt-0.5" style={{color:'var(--muted)'}}>Track employee attendance daily or monthly</p>
        </div>
        <div className="flex gap-2">
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {['daily', 'monthly'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date / Month picker */}
      <div className="flex flex-wrap items-center gap-3">
        {tab === 'daily' ? (
          <>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            <input type="text" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} className="input w-48" />
          </>
        ) : (
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input w-auto" />
        )}
      </div>

      {/* Daily stat pills */}
      {tab === 'daily' && stats && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'bg-gray-100 text-gray-700' },
            { label: 'Present', value: stats.present, color: 'bg-green-100 text-green-700' },
            { label: 'Absent', value: stats.absent, color: 'bg-red-100 text-red-700' },
            { label: 'Half Day', value: stats.half, color: 'bg-yellow-100 text-yellow-700' },
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
                        <td className="table-cell text-center">
                          <span className="badge-green">{s.present_days}</span>
                        </td>
                        <td className="table-cell text-center">
                          <span className="badge-yellow">{s.half_days}</span>
                        </td>
                        <td className="table-cell text-center">
                          <span className="badge-red">{s.absent_days}</span>
                        </td>
                        <td className="table-cell text-center text-gray-500">
                          {s.avg_hours ? `${s.avg_hours}h` : '—'}
                        </td>
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
                      ? s === 'present' ? 'bg-green-500 text-white border-green-500'
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
              <input type="time" value={form.check_in} onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))} className="input" />
            </FormField>
            <FormField label="Check Out">
              <input type="time" value={form.check_out} onChange={e => setForm(p => ({ ...p, check_out: e.target.value }))} className="input" />
            </FormField>
          </div>

          {form.status === 'half_day' && (
            <FormField label="Half Day Reason">
              <input type="text" value={form.half_day_reason} onChange={e => setForm(p => ({ ...p, half_day_reason: e.target.value }))}
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
