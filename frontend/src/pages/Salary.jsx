import { useEffect, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, thisMonth } from '../utils/fmt'
import { Modal, Spinner, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Cheque']

export default function Salary() {
  const { user } = useAuth()
  const isAdmin = ['admin', 'superadmin'].includes(user?.role)

  const [month, setMonth]         = useState(thisMonth())
  const [summary, setSummary]     = useState([])
  const [payments, setPayments]   = useState([])
  const [advances, setAdvances]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('salary') // 'salary' | 'advances'

  // Salary modal
  const [modal, setModal]         = useState(false)
  const [selEmp, setSelEmp]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(defaultSalaryForm())

  // Advance modal
  const [advModal, setAdvModal]   = useState(false)
  const [advForm, setAdvForm]     = useState({ employee_id:'', amount:'', advance_date: new Date().toISOString().split('T')[0], reason:'' })
  const [employees, setEmployees] = useState([])
  const [advSaving, setAdvSaving] = useState(false)

  function defaultSalaryForm() {
    return { bonus:'0', advance_deduction:'0', other_deductions:'0', payment_method:'Cash', notes:'' }
  }

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/attendance/summary', { params: { month } }),
      api.get('/salary', { params: { month } }),
      api.get('/salary/advances', { params: { month } }),
    ]).then(([attRes, payRes, advRes]) => {
      setSummary(attRes.data)
      setPayments(payRes.data)
      setAdvances(advRes.data)
    }).finally(() => setLoading(false))
  }

  const loadEmployees = () => {
    api.get('/employees', { params: { status: 'active' } }).then(r => setEmployees(r.data))
  }

  useEffect(() => { load() }, [month])
  useEffect(() => { if (advModal) loadEmployees() }, [advModal])

  const paidMap = {}
  payments.forEach(p => { paidMap[p.employee_id] = p })

  const openPay = (emp) => {
    setSelEmp(emp)
    const existing = paidMap[emp.id]
    setForm(existing ? {
      bonus: existing.bonus || '0',
      advance_deduction: existing.advance_deduction || '0',
      other_deductions: existing.other_deductions || '0',
      payment_method: existing.payment_method || 'Cash',
      notes: existing.notes || '',
    } : defaultSalaryForm())
    setModal(true)
  }

  const calcFinal = (emp, f) => {
    const daysInMonth = new Date(month + '-01')
    const total = new Date(daysInMonth.getFullYear(), daysInMonth.getMonth() + 1, 0).getDate()
    const workDays = (parseInt(emp.present_days) || 0) + (parseInt(emp.half_days) || 0) * 0.5
    const earned = (parseFloat(emp.monthly_salary) / total) * workDays
    return Math.max(0, earned + parseFloat(f.bonus || 0) - parseFloat(f.advance_deduction || 0) - parseFloat(f.other_deductions || 0))
  }

  const saveSalary = async () => {
    if (!selEmp) return
    setSaving(true)
    const daysInMonth = new Date(month + '-01')
    const total = new Date(daysInMonth.getFullYear(), daysInMonth.getMonth() + 1, 0).getDate()
    const workDays = (parseInt(selEmp.present_days) || 0) + (parseInt(selEmp.half_days) || 0) * 0.5
    const base_salary = (parseFloat(selEmp.monthly_salary) / total) * workDays
    const final_amount = calcFinal(selEmp, form)
    try {
      const payload = {
        employee_id: selEmp.id,
        pay_month: month,
        base_salary: base_salary.toFixed(2),
        present_days: selEmp.present_days || 0,
        half_days: selEmp.half_days || 0,
        absent_days: selEmp.absent_days || 0,
        final_amount: final_amount.toFixed(2),
        is_paid: true,
        ...form,
      }
      if (paidMap[selEmp.id]) {
        await api.put(`/salary/${paidMap[selEmp.id].id}`, payload)
      } else {
        await api.post('/salary', payload)
      }
      setModal(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving salary')
    } finally {
      setSaving(false)
    }
  }

  const saveAdvance = async () => {
    if (!advForm.employee_id || !advForm.amount) return
    setAdvSaving(true)
    try {
      await api.post('/salary/advances', advForm)
      setAdvModal(false)
      setAdvForm({ employee_id:'', amount:'', advance_date: new Date().toISOString().split('T')[0], reason:'' })
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving advance')
    } finally {
      setAdvSaving(false)
    }
  }

  const totalPayroll   = summary.reduce((s, e) => {
    const p = paidMap[e.id]
    return s + (p ? parseFloat(p.final_amount || 0) : 0)
  }, 0)
  const paidCount   = Object.keys(paidMap).length
  const pendingCount = summary.length - paidCount

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Salary</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage payroll & employee advances</p>
        </div>
        <div className="flex gap-3 items-center">
          <input type="month" className="input w-40" value={month}
            onChange={e => setMonth(e.target.value)} />
          {isAdmin && (
            <button className="btn-secondary" onClick={() => setAdvModal(true)}>+ Advance</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Payroll</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{fmt(totalPayroll)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paid</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{paidCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pending</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{pendingCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {['salary', 'advances'].map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {t === 'salary' ? '💼 Salary Payments' : '💳 Advances'}
          </button>
        ))}
      </div>

      {/* Salary Tab */}
      {tab === 'salary' && (
        <div className="card overflow-hidden">
          {loading ? <Spinner /> : summary.length === 0 ? <Empty msg="No active employees found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header text-left">Employee</th>
                    <th className="table-header text-center">Present</th>
                    <th className="table-header text-center">Half Day</th>
                    <th className="table-header text-center">Absent</th>
                    <th className="table-header text-right">Base Salary</th>
                    <th className="table-header text-right">Final Amount</th>
                    <th className="table-header text-center">Status</th>
                    {isAdmin && <th className="table-header text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.map(emp => {
                    const paid = paidMap[emp.id]
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell">
                          <div className="font-semibold text-gray-800">{emp.name}</div>
                          <div className="text-xs text-gray-400">{emp.emp_code} · {emp.designation || '—'}</div>
                        </td>
                        <td className="table-cell text-center text-green-600 font-semibold">{emp.present_days || 0}</td>
                        <td className="table-cell text-center text-yellow-600 font-semibold">{emp.half_days || 0}</td>
                        <td className="table-cell text-center text-red-500 font-semibold">{emp.absent_days || 0}</td>
                        <td className="table-cell text-right text-gray-700">{fmt(emp.monthly_salary)}</td>
                        <td className="table-cell text-right font-bold text-gray-800">
                          {paid ? fmt(paid.final_amount) : '—'}
                        </td>
                        <td className="table-cell text-center">
                          {paid
                            ? <span className="badge-green">Paid</span>
                            : <span className="badge-red">Pending</span>}
                        </td>
                        {isAdmin && (
                          <td className="table-cell text-center">
                            <button onClick={() => openPay(emp)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                              {paid ? 'Edit' : 'Pay'}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Advances Tab */}
      {tab === 'advances' && (
        <div className="card overflow-hidden">
          {loading ? <Spinner /> : advances.length === 0 ? <Empty msg="No advances this month" /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header text-left">Employee</th>
                    <th className="table-header text-left">Date</th>
                    <th className="table-header text-right">Amount</th>
                    <th className="table-header text-left">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {advances.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-800">{a.employee_name}</td>
                      <td className="table-cell text-gray-500">{fmtDate(a.advance_date)}</td>
                      <td className="table-cell text-right font-semibold text-orange-600">{fmt(a.amount)}</td>
                      <td className="table-cell text-gray-500">{a.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Salary Payment Modal */}
      {selEmp && (
        <Modal open={modal} onClose={() => setModal(false)} title={`Pay Salary — ${selEmp.name}`}>
          <div className="bg-orange-50 rounded-xl p-4 mb-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Present Days</span><span className="font-semibold">{selEmp.present_days || 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Half Days</span><span className="font-semibold">{selEmp.half_days || 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Absent Days</span><span className="font-semibold">{selEmp.absent_days || 0}</span></div>
            <div className="flex justify-between border-t border-orange-100 pt-1 mt-1">
              <span className="text-gray-600 font-medium">Estimated Payable</span>
              <span className="font-bold text-orange-600">{fmt(calcFinal(selEmp, form))}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bonus (₹)</label>
                <input className="input" type="number" min="0" value={form.bonus}
                  onChange={e => setForm(f => ({...f, bonus: e.target.value}))} />
              </div>
              <div>
                <label className="label">Advance Deduction (₹)</label>
                <input className="input" type="number" min="0" value={form.advance_deduction}
                  onChange={e => setForm(f => ({...f, advance_deduction: e.target.value}))} />
              </div>
              <div>
                <label className="label">Other Deductions (₹)</label>
                <input className="input" type="number" min="0" value={form.other_deductions}
                  onChange={e => setForm(f => ({...f, other_deductions: e.target.value}))} />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={form.payment_method}
                  onChange={e => setForm(f => ({...f, payment_method: e.target.value}))}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} value={form.notes}
                onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                placeholder="Optional notes…" />
            </div>
          </div>
          <div className="flex justify-between items-center mt-6">
            <div className="text-lg font-bold text-gray-800">
              Final: <span className="text-orange-600">{fmt(calcFinal(selEmp, form))}</span>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveSalary} disabled={saving}>
                {saving ? 'Saving…' : paidMap[selEmp.id] ? 'Update' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Advance Modal */}
      <Modal open={advModal} onClose={() => setAdvModal(false)} title="Record Advance">
        <div className="space-y-4">
          <div>
            <label className="label">Employee *</label>
            <select className="input" value={advForm.employee_id}
              onChange={e => setAdvForm(f => ({...f, employee_id: e.target.value}))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input className="input" type="number" min="0" value={advForm.amount}
              onChange={e => setAdvForm(f => ({...f, amount: e.target.value}))} placeholder="0" />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={advForm.advance_date}
              onChange={e => setAdvForm(f => ({...f, advance_date: e.target.value}))} />
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" value={advForm.reason}
              onChange={e => setAdvForm(f => ({...f, reason: e.target.value}))}
              placeholder="Optional reason…" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setAdvModal(false)}>Cancel</button>
          <button className="btn-primary" onClick={saveAdvance} disabled={advSaving}>
            {advSaving ? 'Saving…' : 'Save Advance'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
