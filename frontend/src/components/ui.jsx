export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#1A1208]/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative bg-[var(--surface)] rounded-t-3xl sm:rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto scrollbar-thin ring-1 ring-[var(--border)]`}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)] rounded-t-3xl sm:rounded-t-2xl">
          <div className="w-8 h-1 bg-[var(--border-strong)] rounded-full sm:hidden absolute left-1/2 -translate-x-1/2 top-2" />
          <h2 className="font-bold text-[var(--ink)] text-base" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--cream-dark)] text-[var(--muted)] hover:text-[var(--chilli)]">x</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, icon, color, sub }) {
  const palettes = {
    red: { bg: 'bg-[#C8102E]', text: 'text-white', ring: 'ring-[#C8102E]/20' },
    orange: { bg: 'bg-[#E8A020]', text: 'text-[#1A1208]', ring: 'ring-[#E8A020]/20' },
    green: { bg: 'bg-[#16A34A]', text: 'text-white', ring: 'ring-[#16A34A]/20' },
    blue: { bg: 'bg-[#2563EB]', text: 'text-white', ring: 'ring-[#2563EB]/20' },
    gray: { bg: 'bg-[#6B5B4E]', text: 'text-white', ring: 'ring-[#6B5B4E]/20' },
  }
  const p = palettes[color] || palettes.orange

  return (
    <div className={`card p-5 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ring-1 ${p.ring}`}>
      <div className={`w-12 h-12 rounded-xl ${p.bg} ${p.text} flex items-center justify-center text-[11px] font-bold shadow-sm flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="label truncate">{label}</div>
        <div className="stat-value truncate">{value}</div>
        {sub && <div className="text-xs text-[var(--muted)] mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  )
}

export function Empty({ msg = 'No data found' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-[var(--muted)]">
      <div className="w-16 h-16 rounded-2xl bg-[var(--cream-dark)] flex items-center justify-center mb-4 text-2xl">-</div>
      <div className="text-sm font-medium">{msg}</div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--cream-dark)]" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--chilli)] animate-spin" />
      </div>
      <div className="text-xs text-[var(--muted)] font-medium tracking-wide">Loading...</div>
    </div>
  )
}

export function FormField({ label, error, children }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      {children}
      {error && <p className="text-xs text-[var(--chilli)] mt-1.5">{error}</p>}
    </div>
  )
}

export function Badge({ status }) {
  const map = {
    present: <span className="badge-green">Present</span>,
    absent: <span className="badge-red">Absent</span>,
    half_day: <span className="badge-yellow">Half Day</span>,
    active: <span className="badge-green">Active</span>,
    inactive: <span className="badge-red">Inactive</span>,
  }
  return map[status] || <span className="badge-gray">{status}</span>
}

export function PaymentBadge({ mode }) {
  const map = { Cash: 'badge-green', UPI: 'badge-blue', Card: 'badge-orange', 'Bank Transfer': 'badge-yellow' }
  return <span className={map[mode] || 'badge-gray'}>{mode}</span>
}

export function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-[var(--border)]" />
      {label && <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">{label}</span>}
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  )
}

export function Notice({ notice, onClose }) {
  if (!notice) return null
  const styles = {
    success: 'bg-[#DCFCE7] border-[#86EFAC] text-[#15803D]',
    error: 'bg-[#FEE2E2] border-[#FCA5A5] text-[#B91C1C]',
    warning: 'bg-[#FFF3D6] border-[#FDE68A] text-[#92400E]',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 ${styles[notice.type] || styles.success}`}>
      <span>{notice.text}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 text-base leading-none">x</button>}
    </div>
  )
}
