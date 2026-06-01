import { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { Spinner, Empty } from '../components/ui'
import { fmtDate } from '../utils/fmt'

const MODULES = ['All', 'Auth', 'Sales', 'Expenses', 'Purchases', 'Inventory', 'Employees', 'Attendance', 'Salary', 'Settings']
const ACTIONS_MAP = {
  Login: '🔐', 'User Created': '👤', 'User Deleted': '🗑️',
  'Employee Added': '➕', 'Employee Updated': '✏️', 'Employee Deleted': '🗑️',
  'Sale Added': '💰', 'Sale Edited': '✏️', 'Sale Deleted': '🗑️',
  'Expense Added': '💸', 'Expense Edited': '✏️', 'Expense Deleted': '🗑️',
  'Purchase Added': '🛒', 'Purchase Edited': '✏️', 'Purchase Deleted': '🗑️',
  'Attendance Marked': '📋', 'Salary Processed': '💼', 'Salary Paid': '✅',
  'Inventory Updated': '📦', 'Settings Updated': '⚙️',
}

function ActionBadge({ action }) {
  const icon = ACTIONS_MAP[action] || '📝'
  const isDelete = action?.toLowerCase().includes('delet')
  const isAdd    = action?.toLowerCase().includes('add') || action?.toLowerCase().includes('creat')
  const isEdit   = action?.toLowerCase().includes('edit') || action?.toLowerCase().includes('updat') || action?.toLowerCase().includes('paid')
  const isLogin  = action === 'Login'
  const cls = isDelete ? 'bg-red-50 text-red-700 border-red-100'
    : isAdd    ? 'bg-green-50 text-green-700 border-green-100'
    : isEdit   ? 'bg-blue-50 text-blue-700 border-blue-100'
    : isLogin  ? 'bg-purple-50 text-purple-700 border-purple-100'
    : 'bg-gray-50 text-gray-600 border-gray-100'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {icon} {action}
    </span>
  )
}

function ModuleBadge({ module: mod }) {
  const colors = {
    Auth: 'bg-purple-100 text-purple-700',
    Sales: 'bg-orange-100 text-orange-700',
    Expenses: 'bg-red-100 text-red-700',
    Purchases: 'bg-yellow-100 text-yellow-700',
    Inventory: 'bg-teal-100 text-teal-700',
    Employees: 'bg-blue-100 text-blue-700',
    Attendance: 'bg-indigo-100 text-indigo-700',
    Salary: 'bg-green-100 text-green-700',
    Settings: 'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[mod] || 'bg-gray-100 text-gray-600'}`}>
      {mod || '—'}
    </span>
  )
}

export default function Audit() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const LIMIT = 50

  const [filters, setFilters] = useState({
    module: 'All',
    search: '',
    from: '',
    to: '',
  })
  const [applied, setApplied] = useState(filters)

  const fetchLogs = useCallback(async (f, pg) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: pg, limit: LIMIT })
      if (f.module !== 'All') params.set('module', f.module)
      if (f.search) params.set('search', f.search)
      if (f.from)   params.set('from', f.from)
      if (f.to)     params.set('to', f.to)
      const { data } = await api.get(`/audit/logs?${params}`)
      setLogs(data.rows || data)
      setTotal(data.total || (data.rows || data).length)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs(applied, page) }, [applied, page, fetchLogs])

  const applyFilters = () => { setPage(1); setApplied({ ...filters }) }
  const resetFilters = () => {
    const def = { module: 'All', search: '', from: '', to: '' }
    setFilters(def); setApplied(def); setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const fmtTs = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{color:'var(--ink)'}}>Audit Log</h1>
        <p className="text-sm mt-0.5" style={{color:'var(--muted)'}}>Complete trail of all system activity</p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Module */}
          <div>
            <label className="label">Module</label>
            <select
              className="input"
              value={filters.module}
              onChange={e => setFilters({ ...filters, module: e.target.value })}
            >
              {MODULES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          {/* From */}
          <div>
            <label className="label">From Date</label>
            <input type="date" className="input" value={filters.from}
              onChange={e => setFilters({ ...filters, from: e.target.value })}/>
          </div>

          {/* To */}
          <div>
            <label className="label">To Date</label>
            <input type="date" className="input" value={filters.to}
              onChange={e => setFilters({ ...filters, to: e.target.value })}/>
          </div>

          {/* Search */}
          <div className="lg:col-span-2">
            <label className="label">Search User / Details</label>
            <input type="text" className="input" placeholder="Search by user name or action details…"
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button onClick={applyFilters} className="btn-primary text-sm px-4 py-1.5">
            Apply Filters
          </button>
          <button onClick={resetFilters} className="btn-secondary text-sm px-4 py-1.5">
            Reset
          </button>
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              {total.toLocaleString()} entries
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <Spinner/> : logs.length === 0 ? <Empty msg="No audit logs found"/> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{color:'var(--muted)'}}>Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{color:'var(--muted)'}}>User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{color:'var(--muted)'}}>Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{color:'var(--muted)'}}>Module</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{color:'var(--muted)'}}>Details</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-28" style={{color:'var(--muted)'}}>IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log, i) => (
                  <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap font-mono" style={{color:'var(--muted)'}}>
                      {fmtTs(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {log.user_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-xs whitespace-nowrap" style={{color:'var(--ink)'}}>{log.user_name || 'System'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActionBadge action={log.action}/>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ModuleBadge module={log.module}/>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate" style={{color:'var(--muted)'}} title={log.details}>
                      {log.details || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{color:'var(--muted)'}}>
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{color:'var(--muted)'}}>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
            >← Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(page - 2 + i, totalPages - 4)) + i
              if (pg > totalPages) return null
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${pg === page ? 'bg-orange-500 text-white' : 'btn-secondary'}`}>
                  {pg}
                </button>
              )
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
