import { useEffect, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import api from '../utils/api'
import { fmt } from '../utils/fmt'
import { StatCard, Spinner } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [chart, setChart] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [period, setPeriod] = useState('monthly')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/today'),
      api.get('/dashboard/monthly-chart'),
      api.get('/inventory/low-stock'),
    ]).then(([s,c,ls]) => {
      setSummary(s.data)
      setChart(c.data)
      setLowStock(ls.data)
    }).finally(()=>setLoading(false))
  }, [])

  if (loading) return <Spinner/>

  const chartLabels = chart?.sales?.map(r=>r.date?.slice(5)) || []
  const salesData = chart?.sales?.map(r=>parseFloat(r.sales)||0) || []
  const expData = chart?.expenses?.map(r=>parseFloat(r.expenses)||0) || []

  const lineData = {
    labels: chartLabels,
    datasets: [
      { label:'Sales', data: salesData, borderColor:'#f97316', backgroundColor:'rgba(249,115,22,0.1)', fill:true, tension:0.4 },
      { label:'Expenses', data: expData, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.05)', fill:true, tension:0.4 },
    ]
  }

  const chartOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 } } } },
    scales:{
      x:{ grid:{ display:false }, ticks:{ font:{ size:10 } } },
      y:{ grid:{ color:'#f0f0f7' }, ticks:{ font:{ size:10 }, callback:v=>`₹${(v/1000).toFixed(0)}k` } }
    }
  }

  const profit = (summary?.net_profit || 0)
  const profitColor = profit >= 0 ? 'green' : 'red'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Today's business overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Sales" value={fmt(summary?.total_sales)} icon="💰" color="orange" sub={`${summary?.total_orders||0} orders`}/>
        <StatCard label="Today's Expenses" value={fmt(summary?.total_expenses)} icon="💸" color="red"/>
        <StatCard label="Net Profit" value={fmt(profit)} icon="📈" color={profitColor}/>
        <StatCard label="Employees Present" value={summary?.present||0} icon="👥" color="blue"
          sub={`${summary?.absent||0} absent · ${summary?.half_day||0} half day`}/>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Low Stock Items" value={summary?.low_stock_count||0} icon="⚠️" color="orange"/>
        <StatCard label="Pending Salaries" value={summary?.pending_salaries||0} icon="💼" color="purple"/>
        <StatCard label="Half Days Today" value={summary?.half_day||0} icon="🌤" color="gray"/>
        <StatCard label="Absent Today" value={summary?.absent||0} icon="❌" color="red"/>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Sales vs Expenses (This Month)</h3>
          <div className="h-56">
            <Line data={lineData} options={chartOpts}/>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Payment Modes Breakdown</h3>
          <div className="space-y-3 mt-2">
            {[
              ['Cash', summary?.total_sales * 0.4, '🟢'],
              ['UPI', summary?.total_sales * 0.35, '🔵'],
              ['Card', summary?.total_sales * 0.15, '🟣'],
              ['Bank Transfer', summary?.total_sales * 0.1, '🟡'],
            ].map(([label, val, dot]) => (
              <div key={label} className="flex items-center gap-3">
                <span>{dot}</span>
                <span className="text-sm text-gray-600 w-28">{label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-orange-400 h-2 rounded-full" style={{width:`${Math.min(100,(val/Math.max(summary?.total_sales,1))*100)}%`}}/>
                </div>
                <span className="text-sm font-semibold text-gray-700 w-20 text-right">{fmt(val)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>⚠️</span> Low Stock Alerts ({lowStock.length})
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {lowStock.map(item => (
              <div key={item.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                <div className="font-semibold text-sm text-gray-800">{item.ingredient_name}</div>
                <div className="text-orange-600 text-xs mt-1">
                  {item.current_stock} {item.unit} (min: {item.minimum_stock})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
