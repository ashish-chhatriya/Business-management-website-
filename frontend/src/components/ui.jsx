export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide?'max-w-2xl':'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-base">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, icon, color, sub }) {
  const colors = {
    orange: 'from-orange-500 to-orange-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    gray: 'from-gray-400 to-gray-500',
  }
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]||colors.orange} flex items-center justify-center text-xl shadow-lg`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-bold text-gray-800 truncate">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function Empty({ msg='No data found' }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-4xl mb-2">📭</div>
      <div className="text-sm">{msg}</div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"/>
    </div>
  )
}

export function FormField({ label, error, children }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

export function Badge({ status }) {
  if (status === 'present') return <span className="badge-green">Present</span>
  if (status === 'absent')  return <span className="badge-red">Absent</span>
  if (status === 'half_day') return <span className="badge-yellow">Half Day</span>
  if (status === 'active')  return <span className="badge-green">Active</span>
  if (status === 'inactive') return <span className="badge-red">Inactive</span>
  return <span className="badge-gray">{status}</span>
}

export function PaymentBadge({ mode }) {
  const map = { Cash:'badge-green', UPI:'badge-blue', Card:'badge-purple', 'Bank Transfer':'badge-gray' }
  const cls = map[mode] || 'badge-gray'
  return <span className={cls}>{mode}</span>
}
