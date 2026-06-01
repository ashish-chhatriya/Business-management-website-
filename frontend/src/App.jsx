import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import Expenses from './pages/Expenses'
import Purchases from './pages/Purchases'
import Inventory from './pages/Inventory'
import Employees from './pages/Employees'
import Attendance from './pages/Attendance'
import Salary from './pages/Salary'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Settings from './pages/Settings'

function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !['admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/sales" element={<PrivateRoute><Layout><Sales /></Layout></PrivateRoute>} />
      <Route path="/expenses" element={<PrivateRoute><Layout><Expenses /></Layout></PrivateRoute>} />
      <Route path="/purchases" element={<PrivateRoute><Layout><Purchases /></Layout></PrivateRoute>} />
      <Route path="/inventory" element={<PrivateRoute><Layout><Inventory /></Layout></PrivateRoute>} />
      <Route path="/employees" element={<PrivateRoute><Layout><Employees /></Layout></PrivateRoute>} />
      <Route path="/attendance" element={<PrivateRoute><Layout><Attendance /></Layout></PrivateRoute>} />
      <Route path="/salary" element={<PrivateRoute><Layout><Salary /></Layout></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><Layout><Reports /></Layout></PrivateRoute>} />
      <Route path="/audit" element={<PrivateRoute adminOnly><Layout><Audit /></Layout></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute adminOnly><Layout><Settings /></Layout></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
