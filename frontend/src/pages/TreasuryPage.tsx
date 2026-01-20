import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, ArrowUpCircle, ArrowDownCircle, Edit3, Trash2, X } from 'lucide-react'
import type { Treasury, Transaction, TransactionType } from '../api/types'

export default function TreasuryPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [formData, setFormData] = useState({
    amount: '',
    type: 'income' as TransactionType,
    description: '',
    category: '',
  })

  const canManage = user?.role === 'treasurer' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'

  const { data: treasury } = useQuery<Treasury>({
    queryKey: ['treasury'],
    queryFn: () => apiClient.get('/api/treasury/balance').then((r) => r.data),
  })

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ['treasury', 'transactions'],
    queryFn: () => apiClient.get('/api/treasury/transactions').then((r) => r.data),
    enabled: canManage,
  })

  const createMutation = useMutation({
    mutationFn: (data: {
      amount: number
      transaction_type: TransactionType
      description: string
      category?: string
    }) => apiClient.post('/api/treasury/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
      setShowForm(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: {
      id: number
      data: {
        amount?: number
        transaction_type?: TransactionType
        description?: string
        category?: string
      }
    }) => apiClient.patch(`/api/treasury/transactions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
      setEditingTransaction(null)
      resetForm()
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/treasury/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const resetForm = () => {
    setFormData({
      amount: '',
      type: 'income',
      description: '',
      category: '',
    })
  }

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx)
    setFormData({
      amount: Math.abs(tx.amount).toString(),
      type: tx.transaction_type,
      description: tx.description,
      category: tx.category || '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      amount: parseFloat(formData.amount),
      transaction_type: formData.type,
      description: formData.description,
      category: formData.category || undefined,
    })
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTransaction) return

    updateMutation.mutate({
      id: editingTransaction.id,
      data: {
        amount: parseFloat(formData.amount),
        transaction_type: formData.type,
        description: formData.description,
        category: formData.category || undefined,
      },
    })
  }

  const handleDelete = (tx: Transaction) => {
    if (window.confirm(`Transaktion "${tx.description}" wirklich löschen? Der Kassenstand wird angepasst.`)) {
      deleteMutation.mutate(tx.id)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Staffelkasse</h1>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Transaktion
          </button>
        )}
      </div>

      {/* Kassenstand */}
      <div className="card mb-8">
        <p className="text-gray-400 mb-2">Aktueller Kontostand</p>
        <p className="text-4xl font-bold text-sc-gold">
          {treasury?.current_balance.toLocaleString('de-DE')} aUEC
        </p>
      </div>

      {/* Neue Transaktion */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Neue Transaktion</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'income' })}
                className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                  formData.type === 'income'
                    ? 'border-sc-green bg-sc-green/20'
                    : 'border-gray-700'
                }`}
              >
                <ArrowUpCircle
                  className={`mx-auto mb-2 ${
                    formData.type === 'income' ? 'text-sc-green' : 'text-gray-400'
                  }`}
                  size={32}
                />
                <p className="font-medium">Eingang</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'expense' })}
                className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-sc-red bg-sc-red/20'
                    : 'border-gray-700'
                }`}
              >
                <ArrowDownCircle
                  className={`mx-auto mb-2 ${
                    formData.type === 'expense' ? 'text-sc-red' : 'text-gray-400'
                  }`}
                  size={32}
                />
                <p className="font-medium">Ausgang</p>
              </button>
            </div>

            <div>
              <label className="label">Betrag (aUEC)</label>
              <input
                type="number"
                min="1"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="z.B. 50000"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Beschreibung</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="z.B. Spende von Max"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Kategorie (optional)</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="z.B. Spende, Ausrüstung, Event"
                className="input"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn btn-primary flex-1"
              >
                {createMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaktions-Historie */}
      {canManage && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Transaktions-Historie</h2>
          {transactions && transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {tx.transaction_type === 'income' ? (
                      <ArrowUpCircle className="text-sc-green" size={24} />
                    ) : (
                      <ArrowDownCircle className="text-sc-red" size={24} />
                    )}
                    <div>
                      <p className="font-medium">{tx.description}</p>
                      <p className="text-sm text-gray-400">
                        {tx.category && `${tx.category} • `}
                        {new Date(tx.created_at).toLocaleDateString('de-DE')} •{' '}
                        {tx.created_by.display_name || tx.created_by.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p
                      className={`font-bold ${
                        tx.amount > 0 ? 'text-sc-green' : 'text-sc-red'
                      }`}
                    >
                      {tx.amount > 0 ? '+' : ''}
                      {tx.amount.toLocaleString('de-DE')} aUEC
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(tx)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit3 size={16} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(tx)}
                          disabled={deleteMutation.isPending}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                          title="Löschen (nur Admin)"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">Noch keine Transaktionen vorhanden.</p>
          )}
        </div>
      )}

      {!canManage && (
        <p className="text-gray-400 text-center">
          Nur Kassenwarte können die Transaktions-Historie einsehen.
        </p>
      )}

      {/* Edit Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Transaktion bearbeiten</h2>
              <button
                onClick={() => {
                  setEditingTransaction(null)
                  resetForm()
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'income' })}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    formData.type === 'income'
                      ? 'border-sc-green bg-sc-green/20'
                      : 'border-gray-700'
                  }`}
                >
                  <ArrowUpCircle
                    className={`mx-auto mb-2 ${
                      formData.type === 'income' ? 'text-sc-green' : 'text-gray-400'
                    }`}
                    size={32}
                  />
                  <p className="font-medium">Eingang</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'expense' })}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    formData.type === 'expense'
                      ? 'border-sc-red bg-sc-red/20'
                      : 'border-gray-700'
                  }`}
                >
                  <ArrowDownCircle
                    className={`mx-auto mb-2 ${
                      formData.type === 'expense' ? 'text-sc-red' : 'text-gray-400'
                    }`}
                    size={32}
                  />
                  <p className="font-medium">Ausgang</p>
                </button>
              </div>

              <div>
                <label className="label">Betrag (aUEC)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  placeholder="z.B. 50000"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Beschreibung</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="z.B. Spende von Max"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Kategorie (optional)</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="z.B. Spende, Ausrüstung, Event"
                  className="input"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTransaction(null)
                    resetForm()
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {updateMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
