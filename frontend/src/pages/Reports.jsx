import { useEffect, useState } from 'react'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import api from '../utils/api'
import { fmt, fmtDate, thisMonth } from '../utils/fmt'
import { downloadCsv } from '../utils/csv'
import { Spinner } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

const PERIODS = [
  { label: 'This Month', value: 'month' },
  { label: 'This Year',  value: 'year'  },
  { label: 'Today',      value: 'day'   },
  { label: 'Custom',     value: 'custom' },
]

export default function Reports() {
  const [period, setPeriod]       = useState('month')
  const [date, setDate]           = useState(thisMonth())
  const [loading, setLoading]     = useState(true)
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [shopId, setShopId]       = useState('')
  const [shops, setShops]         = useState([])

  const [salesSum, setSalesSum]       = useState(null)
  const [expSum, setExpSum]           = useState([])
  const [salesChart, setSalesChart]   = useState([])
  const [salesByShop, setSalesByShop] = useState([])
  const [attendance, setAttendance]   = useState([])
  const [purchases, setPurchases]     = useState([])

  const load = () => {
    setLoading(true)
    const p = { period, date }
    const shopParams = period === 'custom'
      ? { period, from, to, shop_id: shopId || undefined }
      : { period, date, shop_id: shopId || undefined }
    Promise.all([
      api.get('/sales/summary',  { params: p }),
      api.get('/expenses/summary', { params: p }),
      api.get('/sales/chart',    { params: p }),
      api.get('/reports/sales/by-shop', { params: shopParams }),
      api.get('/attendance/summary', { params: { month: date.slice(0,7) } }),
      api.get('/purchases',      { params: period === 'month' ? { from: date+'-01', to: date+'-31' } : {} }),
    ]).then(([ss, es, sc, shopSales, att, pur]) => {
      setSalesSum(ss.data)
      setExpSum(es.data)
      setSalesChart(sc.data)
      setSalesByShop(shopSales.data)
      setAttendance(att.data)
      setPurchases(pur.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/shops').then(r => setShops(r.data))
  }, [])
  useEffect(() => { load() }, [period, date, from, to, shopId])

  const totalExpenses = expSum.reduce((s, r) => s + parseFloat(r.total || 0), 0)
  const totalPurchases = purchases.reduce((s, r) => s + parseFloat(r.price_paid || 0), 0)
  const totalSales = parseFloat(salesSum?.total_sales || 0)
  const netProfit = totalSales - totalExpenses - totalPurchases

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { grid: { color: '#f0f0f7' }, ticks: { font: { size: 10 }, callback: v => `₹${(v/1000).toFixed(0)}k` } }
    }
  }

  const salesBarData = {
    labels: salesChart.map(r => r.label),
    datasets: [{
      label: 'Sales',
      data: salesChart.map(r => parseFloat(r.value || 0)),
      backgroundColor: 'rgba(249,115,22,0.8)',
      borderRadius: 6,
    }]
  }

  const expColors = ['#f97316','#ef4444','#8b5cf6','#3b82f6','#10b981','#f59e0b','#6b7280','#ec4899']
  const doughnutData = {
    labels: expSum.map(r => r.category),
    datasets: [{
      data: expSum.map(r => parseFloat(r.total || 0)),
      backgroundColor: expColors,
      borderWidth: 0,
    }]
  }

  const totalPresent  = attendance.reduce((s, e) => s + parseInt(e.present_days || 0), 0)
  const totalHalfDays = attendance.reduce((s, e) => s + parseInt(e.half_days || 0), 0)
  const totalAbsent   = attendance.reduce((s, e) => s + parseInt(e.absent_days || 0), 0)
  const shopTotals = salesByShop.reduce((map, row) => {
    map[row.shop] = (map[row.shop] || 0) + parseFloat(row.total || 0)
    return map
  }, {})
  const shopComparisonData = {
    labels: Object.keys(shopTotals),
    datasets: [{
      label: 'Sales by Shop',
      data: Object.values(shopTotals),
      backgroundColor: '#D62828',
      borderRadius: 6,
    }]
  }
  const exportShopReport = () => downloadCsv('sales-by-shop-report.csv', ['Date','Time','Shop','Total','Mode'],
    salesByShop.map(r => ({ Date: r.date?.slice(0,10), Time: r.time, Shop: r.shop, Total: r.total, Mode: r.mode }))
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Business performance overview</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            {PERIODS.map(p => (
              <button key={p.value}
                onClick={() => { setPeriod(p.value); setDate(p.value === 'year' ? new Date().getFullYear().toString() : p.value === 'day' ? new Date().toISOString().split('T')[0] : thisMonth()) }}
                className={`px-4 py-2 text-sm font-medium transition-all ${period === p.value ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <>
              <input type="date" className="input w-40" value={from} onChange={e => setFrom(e.target.value)} />
              <input type="date" className="input w-40" value={to} onChange={e => setTo(e.target.value)} />
            </>
          ) : (
            <input
              type={period === 'month' ? 'month' : period === 'year' ? 'number' : 'date'}
              className="input w-40"
              value={date}
              onChange={e => setDate(e.target.value)}
              min={period === 'year' ? '2020' : undefined}
              max={period === 'year' ? new Date().getFullYear().toString() : undefined}
            />
          )}
          <select className="input w-52" value={shopId} onChange={e=>setShopId(e.target.value)}>
            <option value="">All Shops</option>
            {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
          <button className="btn-secondary" onClick={exportShopReport} disabled={!salesByShop.length}>Export CSV</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Sales</div>
              <div className="text-xl font-bold text-orange-600 mt-1">{fmt(totalSales)}</div>
              <div className="text-xs text-gray-400 mt-1">{salesSum?.total_orders || 0} orders</div>
            </div>
            <div className="card p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Expenses</div>
              <div className="text-xl font-bold text-red-500 mt-1">{fmt(totalExpenses)}</div>
              <div className="text-xs text-gray-400 mt-1">{expSum.length} categories</div>
            </div>
            <div className="card p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Purchases</div>
              <div className="text-xl font-bold text-blue-600 mt-1">{fmt(totalPurchases)}</div>
              <div className="text-xs text-gray-400 mt-1">{purchases.length} records</div>
            </div>
            <div className="card p-5">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Net Profit</div>
              <div className={`text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(netProfit)}</div>
              <div className="text-xs text-gray-400 mt-1">
                {totalSales > 0 ? `${((netProfit / totalSales) * 100).toFixed(1)}% margin` : '—'}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-700 mb-4">Sales Trend</h3>
              <div className="h-56">
                {salesChart.length > 0
                  ? <Bar data={salesBarData} options={chartOpts} />
                  : <div className="flex items-center justify-center h-full text-gray-400 text-sm">No sales data</div>}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Expense Breakdown</h3>
              <div className="h-40">
                {expSum.length > 0
                  ? <Doughnut data={doughnutData} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:10 } } } } }} />
                  : <div className="flex items-center justify-center h-full text-gray-400 text-sm">No expense data</div>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-700 mb-4">Sales Comparison Between Shops</h3>
              <div className="h-56">
                {Object.keys(shopTotals).length > 0
                  ? <Bar data={shopComparisonData} options={chartOpts} />
                  : <div className="flex items-center justify-center h-full text-gray-400 text-sm">No shop sales data</div>}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Top Performing Shop</h3>
              {Object.entries(shopTotals).sort((a,b)=>b[1]-a[1]).slice(0,1).map(([shop,total]) => (
                <div key={shop} className="rounded-lg bg-[#fff0b0] border border-[#FFC300] p-4">
                  <div className="text-sm font-bold text-[#7a5400]">{shop}</div>
                  <div className="text-2xl font-black text-[#D62828] mt-2">{fmt(total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">Sales by Shop</h3>
              <button className="btn-secondary" onClick={exportShopReport} disabled={!salesByShop.length}>Export Filtered CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date','Time','Shop','Total','Mode'].map(h => <th key={h} className="table-header text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {salesByShop.length ? salesByShop.map((r, idx) => (
                    <tr key={`${r.date}-${r.time}-${r.shop}-${idx}`} className="hover:bg-gray-50">
                      <td className="table-cell">{fmtDate(r.date)}</td>
                      <td className="table-cell">{r.time}</td>
                      <td className="table-cell font-semibold text-gray-800">{r.shop}</td>
                      <td className="table-cell font-bold text-[#D62828]">{fmt(r.total)}</td>
                      <td className="table-cell">{r.mode}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" className="table-cell text-center text-gray-400 py-8">No sales found for this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Mode Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Sales by Payment Mode</h3>
              {salesSum ? (
                <div className="space-y-3">
                  {[
                    { label:'Cash',          val: salesSum.cash,          color:'bg-green-400'  },
                    { label:'UPI',           val: salesSum.upi,           color:'bg-blue-400'   },
                    { label:'Card',          val: salesSum.card,          color:'bg-purple-400' },
                    { label:'Bank Transfer', val: salesSum.bank_transfer,  color:'bg-yellow-400' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-28">{label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className={`${color} h-2 rounded-full`}
                          style={{ width: `${Math.min(100, (parseFloat(val||0) / Math.max(totalSales, 1)) * 100)}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-20 text-right">{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-gray-400 text-sm text-center py-4">No data</div>}
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Attendance Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Total Present', val: totalPresent,  color:'text-green-600', bg:'bg-green-50'  },
                  { label: 'Half Days',     val: totalHalfDays, color:'text-yellow-600', bg:'bg-yellow-50' },
                  { label: 'Absent',        val: totalAbsent,   color:'text-red-500',  bg:'bg-red-50'   },
                  { label: 'Employees',     val: attendance.length, color:'text-blue-600', bg:'bg-blue-50' },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} className={`flex items-center justify-between ${bg} rounded-xl px-4 py-3`}>
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className={`font-bold text-lg ${color}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expense Category Table */}
          {expSum.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Expense Categories</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="table-header text-left">Category</th>
                      <th className="table-header text-right">Amount</th>
                      <th className="table-header text-right">% of Total</th>
                      <th className="table-header text-left">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {expSum.map((r, i) => {
                      const pct = totalExpenses > 0 ? (parseFloat(r.total) / totalExpenses * 100).toFixed(1) : 0
                      return (
                        <tr key={r.category} className="hover:bg-gray-50">
                          <td className="table-cell">
                            <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle"
                              style={{ backgroundColor: expColors[i % expColors.length] }} />
                            {r.category}
                          </td>
                          <td className="table-cell text-right font-semibold">{fmt(r.total)}</td>
                          <td className="table-cell text-right text-gray-500">{pct}%</td>
                          <td className="table-cell">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width:`${pct}%`, backgroundColor: expColors[i % expColors.length] }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
