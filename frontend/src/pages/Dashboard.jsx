import { useEffect, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import api from '../utils/api'
import { fmt } from '../utils/fmt'
import { StatCard, Spinner, Empty } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [chart, setChart] = useState(null)
  const [lowStock, setLowStock] = useState([])
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
  const topShops = summary?.monthly_sales_by_shop || []

  const chartOpts = {
    responsive:true,
    maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 } } } },
    scales:{
      x:{ grid:{ display:false }, ticks:{ font:{ size:10 } } },
      y:{ grid:{ color:'#f5e6d3' }, ticks:{ font:{ size:10 }, callback:v=>`Rs ${(v/1000).toFixed(0)}k` } }
    }
  }

  const lineData = {
    labels: chartLabels,
    datasets: [
      { label:'Sales', data: salesData, borderColor:'#D62828', backgroundColor:'rgba(214,40,40,0.10)', fill:true, tension:0.4 },
      { label:'Expenses', data: expData, borderColor:'#FFC300', backgroundColor:'rgba(255,195,0,0.16)', fill:true, tension:0.4 },
    ]
  }

  const barData = {
    labels: topShops.map(i=>i.shop_name),
    datasets: [
      { label:'Revenue', data: topShops.map(i=>parseFloat(i.total_sales || i.total_revenue)||0), backgroundColor:'#D62828', borderRadius:6 },
    ]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{color:'var(--ink)'}}>Welcome to Business Management System</h1>
          <p className="text-sm mt-1" style={{color:'var(--muted)'}}>Today's business operations at a glance.</p>
        </div>
        <div className="rounded-lg bg-[#FFC300] px-4 py-2 text-sm font-bold text-[#3b2500]">
          Live Anand Fast Food
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Today's Sales" value={fmt(summary?.total_sales)} icon="TS" color="red" sub={`${summary?.total_orders||0} orders`}/>
        <StatCard label="Monthly Sales" value={fmt(summary?.monthly_sales)} icon="MS" color="orange" sub={`${summary?.monthly_orders||0} orders`}/>
        <StatCard label="Inventory Value" value={fmt(summary?.inventory_value)} icon="IV" color="green"/>
        <StatCard label="Pending Salaries" value={fmt(summary?.pending_salary_amount)} icon="PS" color="purple" sub={`${summary?.pending_salaries||0} records`}/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Employee Count" value={summary?.employee_count||0} icon="EC" color="blue"/>
        <StatCard label="Attendance Today" value={summary?.present||0} icon="AT" color="green" sub={`${summary?.absent||0} absent, ${summary?.half_day||0} half day`}/>
        <StatCard label="Today's Expenses" value={fmt(summary?.total_expenses)} icon="EX" color="red"/>
        <StatCard label="Top Performing Shop" value={summary?.top_performing_shop?.shop_name || '-'} icon="TP" color="orange"/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold" style={{color:'var(--ink)'}}>Sales vs Expenses</h3>
            <span className="badge-yellow">This Month</span>
          </div>
          <div className="h-64">
            <Line data={lineData} options={chartOpts}/>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold mb-4" style={{color:'var(--ink)'}}>Sales Comparison by Shop</h3>
          {topShops.length ? (
            <div className="h-64">
              <Bar data={barData} options={{...chartOpts, indexAxis:'y', plugins:{ legend:{ display:false } }}}/>
            </div>
          ) : <Empty msg="No shop sales yet"/>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-bold mb-4" style={{color:'var(--ink)'}}>Today's Sales by Shop</h3>
          <div className="space-y-3">
            {(summary?.today_sales_by_shop || []).length ? summary.today_sales_by_shop.map(shop => (
              <div key={shop.shop_name} className="flex items-center justify-between rounded-lg bg-[#fff8ed] border border-red-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-800">{shop.shop_name}</span>
                <span className="font-black text-[#D62828]">{fmt(shop.total_sales)}</span>
              </div>
            )) : <Empty msg="No shop sales today"/>}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold mb-4" style={{color:'var(--ink)'}}>Total Sales for Each Shop</h3>
          <div className="space-y-3">
            {(summary?.shop_sales_totals || []).length ? summary.shop_sales_totals.map(shop => (
              <div key={shop.shop_name} className="flex items-center justify-between rounded-lg bg-white border border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-800">{shop.shop_name}</span>
                <span className="font-black text-[#D62828]">{fmt(shop.total_sales)}</span>
              </div>
            )) : <Empty msg="No shop totals yet"/>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-bold mb-4" style={{color:'var(--ink)'}}>Recent Activity</h3>
          <div className="space-y-3">
            {(summary?.recent_activity || []).length ? summary.recent_activity.map((item, idx) => (
              <div key={`${item.created_at}-${idx}`} className="flex gap-3 rounded-lg border border-gray-100 p-3 hover:border-red-100 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-[#fff0b0] text-[#7a5400] flex items-center justify-center text-xs font-black">
                  {item.module?.slice(0,2)?.toUpperCase() || 'AC'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{color:'var(--ink)'}}>{item.action}</div>
                  <div className="text-xs" style={{color:'var(--muted)'}}>{item.details || item.module}</div>
                </div>
              </div>
            )) : <Empty msg="No recent activity"/>}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold mb-4" style={{color:'var(--ink)'}}>Stock Watch</h3>
          {lowStock.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lowStock.slice(0, 6).map(item => (
                <div key={item.id} className="bg-[#fff8ed] border border-red-100 rounded-lg p-3">
                  <div className="font-semibold text-sm" style={{color:'var(--ink)'}}>{item.ingredient_name}</div>
                  <div className="text-[#D62828] text-xs mt-1">
                    {item.current_stock} {item.unit} in stock, minimum {item.minimum_stock}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty msg="No low-stock alerts"/>}
        </div>
      </div>
    </div>
  )
}
