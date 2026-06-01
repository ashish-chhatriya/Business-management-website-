import { useEffect, useRef, useState } from 'react'
import api from '../utils/api'
import { fmt, fmtDate, thisMonth } from '../utils/fmt'
import { downloadCsv, downloadTemplate, parseCsvFile } from '../utils/csv'
import { Modal, Spinner, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Cheque']
const SALARY_TEMPLATE_HEADERS = ['employee_code','pay_month','base_salary','present_days','half_days','absent_days','bonus','advance_deduction','other_deductions','final_amount','payment_method','notes']
const ADVANCE_TEMPLATE_HEADERS = ['employee_code','amount','advance_date','reason']
const MONTHS = [
  { label: 'Jan', value: '01' },
  { label: 'Feb', value: '02' },
  { label: 'Mar', value: '03' },
  { label: 'Apr', value: '04' },
  { label: 'May', value: '05' },
  { label: 'Jun', value: '06' },
  { label: 'Jul', value: '07' },
  { label: 'Aug', value: '08' },
  { label: 'Sep', value: '09' },
  { label: 'Oct', value: '10' },
  { label: 'Nov', value: '11' },
  { label: 'Dec', value: '12' },
]

export default function Salary() {
  const { user } = useAuth()
  const canEdit = ['admin', 'superadmin'].includes(user?.role)
  const canImportExport = canEdit
  const isEmployee = user?.role === 'employee'

  const [year, setYear]           = useState(new Date().getFullYear().toString())
  const [matrix, setMatrix]       = useState([])
  const [matrixLoading, setMatrixLoading] = useState(true)
  const [savingCells, setSavingCells] = useState({})
  const [matrixError, setMatrixError] = useState(null)

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

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState([])
  const [importPreviewError, setImportPreviewError] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [importingCsv, setImportingCsv] = useState(false)
  const fileInputRef = useRef(null)

  function defaultSalaryForm() {
    return { bonus:'0', advance_deduction:'0', other_deductions:'0', payment_method:'Cash', notes:'' }
  }

  const loadMatrix = async () => {
    setMatrixLoading(true)
    setMatrixError(null)
    try {
      const { data } = await api.get('/salary/matrix', { params: { year } })
      setMatrix(data)
    } catch (err) {
      setMatrixError(err.response?.data?.error || 'Unable to load salary matrix')
    } finally {
      setMatrixLoading(false)
    }
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

  const normalizeEmployeeName = (name) => String(name || '').trim().toLowerCase()

  const clearImportState = () => {
    setImportPreview([])
    setImportPreviewError(null)
    setImportSummary(null)
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    clearImportState()
  }

  const buildEmployeeLookup = () => {
    const lookup = {}
    matrix.forEach((row) => {
      const key = normalizeEmployeeName(row.name)
      lookup[key] = lookup[key] || []
      lookup[key].push(row)
    })
    return lookup
  }

  const parseCsvValue = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'paid'].includes(normalized)) return true
    if (['0', 'false', 'no', 'unpaid'].includes(normalized)) return false
    return null
  }

  const handleCsvFile = async (file) => {
    if (!file) return
    if (!matrix.length) {
      setImportPreviewError('Load the salary matrix before importing CSV.')
      setImportModalOpen(true)
      return
    }

    try {
      const rows = await parseCsvFile(file)
      if (!rows.length) {
        setImportPreviewError('CSV file is empty.')
        setImportModalOpen(true)
        return
      }

      const header = rows[0].map((cell) => String(cell || '').trim())
      const expected = ['Employee', ...MONTHS.map((m) => m.label)]
      const headerValid = expected.every((label, index) => String(header[index] || '').trim().toLowerCase() === label.toLowerCase())
      if (!headerValid || header.length < expected.length) {
        setImportPreviewError('CSV must include header: Employee, Jan, Feb, ..., Dec')
        setImportModalOpen(true)
        return
      }

      const lookup = buildEmployeeLookup()
      const previewRows = rows.slice(1).filter((row) => row.some((cell) => String(cell || '').trim())).map((row, rowIndex) => {
        const employee = String(row[0] || '').trim()
        const messages = []
        const normalizedName = normalizeEmployeeName(employee)
        const matches = lookup[normalizedName] || []
        let matrixRow = null
        if (!employee) {
          messages.push('Missing employee name')
        } else if (matches.length === 0) {
          messages.push('Employee not found in matrix')
        } else if (matches.length > 1) {
          messages.push('Employee name is ambiguous; use a unique name')
        } else {
          matrixRow = matches[0]
        }

        const importedMonths = {}
        MONTHS.forEach((monthObj, index) => {
          const csvValue = row[index + 1]
          const parsed = parseCsvValue(csvValue)
          if (parsed === null) {
            messages.push(`Invalid value for ${monthObj.label} (expected 0/1 or paid/unpaid)`) }
          importedMonths[monthObj.value] = parsed === true
        })

        const currentMonths = matrixRow ? MONTHS.reduce((acc, monthObj) => {
          const key = monthObj.value
          acc[key] = matrixRow.months?.[`${year}-${monthObj.value}`] === true
          return acc
        }, {}) : {}

        const valid = messages.length === 0
        return {
          id: rowIndex,
          employee,
          employee_id: matrixRow?.employee_id || null,
          emp_code: matrixRow?.emp_code || '',
          importedMonths,
          currentMonths,
          valid,
          messages,
        }
      })

      const validCount = previewRows.filter((row) => row.valid).length
      const invalidCount = previewRows.length - validCount
      setImportPreview(previewRows)
      setImportSummary({ total: previewRows.length, valid: validCount, invalid: invalidCount, changed: 0, updatedRows: 0, errors: [] })
      setImportPreviewError(null)
      setImportModalOpen(true)
    } catch (err) {
      setImportPreviewError(err.message || 'Unable to parse CSV file.')
      setImportModalOpen(true)
    }
  }

  const onCsvInputChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    await handleCsvFile(file)
  }

  const importValidRows = async () => {
    if (!importPreview.length) return
    setImportingCsv(true)
    const validRows = importPreview.filter((row) => row.valid)
    let changed = 0
    let updatedRows = 0
    const errors = []

    for (const row of validRows) {
      let rowChanged = false
      const importYear = String(year || '').trim()
      for (const monthNumber of Object.keys(row.importedMonths)) {
        const importedPaid = row.importedMonths[monthNumber]
        const currentPaid = row.currentMonths[monthNumber]
        if (importedPaid === currentPaid) continue

        const routeMonth = String(monthNumber || '').trim().padStart(2, '0')
        const action = importedPaid ? 'paid' : 'unpaid'
        try {
          await api.put(`/salary/matrix/${row.employee_id}/${importYear}/${routeMonth}/${action}`)
          changed += 1
          rowChanged = true
        } catch (err) {
          errors.push(`${row.employee} ${importYear}-${routeMonth}: ${err.response?.data?.error || err.message}`)
        }
      }
      if (rowChanged) updatedRows += 1
    }

    await loadMatrix()
    setImportSummary((prev) => ({
      ...prev,
      changed,
      updatedRows,
      errors,
    }))
    setImportingCsv(false)
  }

  useEffect(() => { loadMatrix() }, [year])
  useEffect(() => { load() }, [month])
  useEffect(() => { if (advModal) loadEmployees() }, [advModal])

  const toggleSalaryStatus = async (employeeId, monthValue, currentPaid) => {
    if (!canEdit) return
    const key = `${employeeId}-${monthValue}`
    setSavingCells(prev => ({ ...prev, [key]: true }))
    try {
      const action = currentPaid ? 'unpaid' : 'paid'
      const { data } = await api.put(`/salary/matrix/${employeeId}/${year}/${monthValue}/${action}`)
      setMatrix(prev => prev.map(row => {
        if (row.employee_id !== employeeId) return row
        return {
          ...row,
          months: {
            ...row.months,
            [`${year}-${monthValue}`]: data.is_paid === true,
          },
        }
      }))
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to update salary status')
    } finally {
      setSavingCells(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const visibleMatrix = isEmployee ? matrix.filter((row) => row.employee_id === user?.id) : matrix

  const paidCount = visibleMatrix.reduce((sum, row) => {
    return sum + MONTHS.reduce((count, month) => count + (row.months?.[`${year}-${month.value}`] ? 1 : 0), 0)
  }, 0)
  const totalCells = visibleMatrix.length * 12
  const pendingCount = totalCells - paidCount

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
      loadMatrix()
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
  const downloadSalaryTemplate = () => downloadTemplate('salary-template.csv', SALARY_TEMPLATE_HEADERS, {
    employee_code: 'EMP-001',
    pay_month: month,
    base_salary: '25000',
    present_days: '26',
    half_days: '1',
    absent_days: '1',
    bonus: '1000',
    advance_deduction: '500',
    other_deductions: '0',
    final_amount: '25500',
    payment_method: 'Cash',
    notes: 'Monthly payout',
  })
  const downloadAdvanceTemplate = () => downloadTemplate('salary-advance-template.csv', ADVANCE_TEMPLATE_HEADERS, {
    employee_code: 'EMP-001',
    amount: '2000',
    advance_date: new Date().toISOString().split('T')[0],
    reason: 'Emergency advance',
  })
  const downloadSalaryHistory = () => downloadCsv('salary-history.csv', SALARY_TEMPLATE_HEADERS,
    payments.map(p => ({
      employee_code: p.emp_code,
      pay_month: p.pay_month,
      base_salary: p.base_salary,
      present_days: p.present_days,
      half_days: p.half_days,
      absent_days: p.absent_days,
      bonus: p.bonus,
      advance_deduction: p.advance_deduction,
      other_deductions: p.other_deductions,
      final_amount: p.final_amount,
      payment_method: p.payment_method || '',
      notes: p.notes || '',
    }))
  )
  const downloadAdvanceHistory = () => downloadCsv('salary-advance-history.csv', ['employee_name','advance_date','amount','reason'],
    advances.map(a => ({
      employee_name: a.employee_name,
      advance_date: a.advance_date?.slice(0,10),
      amount: a.amount,
      reason: a.reason || '',
    }))
  )

  const exportSalaryMatrix = () => {
    const headers = ['Employee', ...MONTHS.map((m) => m.label)]
    const rows = matrix.map((row) => {
      const csvRow = {
        Employee: row.name || row.emp_code || 'Unknown',
      }
      MONTHS.forEach((monthObj) => {
        const monthKey = `${year}-${monthObj.value}`
        csvRow[monthObj.label] = row.months?.[monthKey] === true ? '1' : '0'
      })
      return csvRow
    })
    downloadCsv(`salary-matrix-${year}.csv`, headers, rows)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{color:'var(--ink)'}}>Salary</h1>
          <p className="text-sm mt-0.5" style={{color:'var(--muted)'}}>Yearly salary matrix with paid/unpaid status</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Year</label>
            <input
              type="number"
              min="2000"
              max="2099"
              className="input w-28"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={loadMatrix}>Refresh</button>
          {canImportExport && (
            <>
              <button className="btn-secondary" onClick={exportSalaryMatrix}>Export CSV</button>
              <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>Import CSV</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={onCsvInputChange}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Employees</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{matrix.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paid cells</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{paidCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pending cells</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{pendingCount}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {matrixLoading ? (
          <Spinner />
        ) : matrixError ? (
          <Empty msg={matrixError} />
        ) : matrix.length === 0 ? (
          <Empty msg="No employees found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header text-left">Employee</th>
                  {MONTHS.map((monthObj) => (
                    <th key={monthObj.value} className="table-header text-center">{monthObj.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleMatrix.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <div className="font-semibold text-gray-800">{row.name}</div>
                      <div className="text-xs text-gray-400">{row.emp_code}</div>
                    </td>
                    {MONTHS.map((monthObj) => {
                      const monthKey = `${year}-${monthObj.value}`
                      const paid = row.months?.[monthKey] === true
                      const saving = savingCells[`${row.employee_id}-${monthKey}`]
                      return (
                        <td key={monthObj.value} className="table-cell text-center">
                          <button
                            type="button"
                            disabled={!canEdit || saving}
                            onClick={() => toggleSalaryStatus(row.employee_id, monthObj.value, paid)}
                            className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition ${paid ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-red-50 hover:bg-red-100'} ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${saving ? 'opacity-60' : ''}`}
                            aria-label={`${row.name} ${monthObj.label} ${paid ? 'Paid' : 'Pending'}`}>
                            <span className={`text-lg font-semibold ${paid ? 'text-emerald-600' : 'text-red-600'}`}>
                              {paid ? '✓' : '✗'}
                            </span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</span>
          Paid
        </div>
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-600">✗</span>
          Pending
        </div>
        {canEdit && <div>Click a cell to toggle paid/unpaid.</div>}
      </div>

      <Modal open={importModalOpen} onClose={closeImportModal} title="Salary Matrix CSV Preview">
        <div className="space-y-4">
          {importPreviewError ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-red-700">{importPreviewError}</div>
          ) : (
            <>
              <div className="space-y-2 text-sm text-gray-700">
                <p>Imported rows: <strong>{importSummary?.total ?? 0}</strong></p>
                <p>Valid rows: <strong>{importSummary?.valid ?? 0}</strong></p>
                <p>Invalid rows: <strong>{importSummary?.invalid ?? 0}</strong></p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header text-left">Employee</th>
                      <th className="table-header text-left">Code</th>
                      <th className="table-header text-center">Status</th>
                      <th className="table-header text-left">Messages</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importPreview.map((row) => (
                      <tr key={row.id} className={row.valid ? 'bg-white' : 'bg-red-50'}>
                        <td className="table-cell font-medium text-gray-800">{row.employee}</td>
                        <td className="table-cell text-gray-500">{row.emp_code || '—'}</td>
                        <td className="table-cell text-center">
                          {row.valid ? <span className="text-emerald-700">Valid</span> : <span className="text-red-600">Invalid</span>}
                        </td>
                        <td className="table-cell text-gray-600">
                          {row.messages.length ? row.messages.join('; ') : 'Ready to import'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importSummary?.errors?.length > 0 && (
                <div className="rounded-xl bg-yellow-50 border border-yellow-100 p-4 text-yellow-700">
                  <div className="font-semibold">Import warnings</div>
                  <ul className="list-disc pl-5 mt-2 text-sm">
                    {importSummary.errors.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={closeImportModal}>Close</button>
          <button
            className="btn-primary"
            onClick={importValidRows}
            disabled={importingCsv || !(importSummary?.valid > 0)}>
            {importingCsv ? 'Importing…' : 'Import Valid Rows'}
          </button>
        </div>
      </Modal>

      <div className="flex gap-2">
        {['salary', 'advances'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {t === 'salary' ? '💼 Salary Matrix' : '💳 Advances'}
          </button>
        ))}
      </div>

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
                  {advances.map((a) => (
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
