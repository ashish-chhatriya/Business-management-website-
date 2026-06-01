export const fmt = (n) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0)
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
export const fmtTime = (t) => {
  if (!t) return '—'
  const [h,m] = t.split(':')
  const hr = parseInt(h)
  return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`
}
export const today = () => new Date().toISOString().split('T')[0]
export const thisMonth = () => new Date().toISOString().slice(0,7)
