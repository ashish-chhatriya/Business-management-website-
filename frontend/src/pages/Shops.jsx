import { useEffect, useState } from 'react'
import api from '../utils/api'
import { Modal, Empty, Spinner, FormField, Badge } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const empty = { name:'', address:'', is_active:true }

export default function Shops() {
  const { user } = useAuth()
  const isAdmin = ['admin','superadmin'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/shops', { params: { include_inactive: true } })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(empty)
    setErr('')
    setModal(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({ name: row.name, address: row.address || '', is_active: row.is_active })
    setErr('')
    setModal(true)
  }

  const save = async () => {
    setErr('')
    setSaving(true)
    try {
      if (!form.name.trim()) {
        setErr('Shop name is required')
        return
      }
      if (editing) await api.put(`/shops/${editing.id}`, form)
      else await api.post('/shops', form)
      setModal(false)
      load()
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Deactivate this shop? Existing sales history will remain available.')) return
    await api.delete(`/shops/${id}`)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Shops</h1>
          <p className="text-sm text-gray-500">Manage sales locations for shop-wise tracking.</p>
        </div>
        {isAdmin && <button onClick={openAdd} className="btn-primary">Add Shop</button>}
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner/> : rows.length === 0 ? <Empty msg="No shops found"/> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-red-100">
                <tr>
                  <th className="table-header text-left">Shop</th>
                  <th className="table-header text-left">Address</th>
                  <th className="table-header text-center">Status</th>
                  {isAdmin && <th className="table-header text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-[#fff8ed]">
                    <td className="table-cell font-semibold text-gray-900">{row.name}</td>
                    <td className="table-cell text-gray-500">{row.address || '-'}</td>
                    <td className="table-cell text-center"><Badge status={row.is_active ? 'active' : 'inactive'}/></td>
                    {isAdmin && (
                      <td className="table-cell">
                        <div className="flex justify-center gap-2">
                          <button onClick={()=>openEdit(row)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                          {row.is_active && <button onClick={()=>remove(row.id)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title={editing ? 'Edit Shop' : 'Add Shop'}>
        <div className="space-y-4">
          <FormField label="Shop Name">
            <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Main Branch" className="input"/>
          </FormField>
          <FormField label="Address">
            <textarea value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} rows={2} className="input resize-none"/>
          </FormField>
          {editing && (
            <FormField label="Status">
              <select value={form.is_active ? 'active' : 'inactive'} onChange={e=>setForm(p=>({...p,is_active:e.target.value === 'active'}))} className="input">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
          )}
          {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Shop'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
