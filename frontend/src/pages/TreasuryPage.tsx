import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Edit3, Trash2, X, Upload, TrendingUp, TrendingDown, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Treasury, Transaction, TransactionType, CSVImportResponse } from '../api/types'

const ITEMS_PER_PAGE = 50

// Feste Kategorien für Transaktionen
const TRANSACTION_CATEGORIES = [
  'Einzahlung',
  'Spende',
  'Schiff Fitting',
  'Beschaffung Schiff',
  'Beschaffung Ausrüstung',
  'Restock / Aufmunitionierung',
  'Reparaturkosten',
  'Anteil Aktivität',
  'Bereinigung',
  'Veruntreuung von Geldern',
  'Wiederholte ausgabe (Bug)',
]

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

  // Filter und Pagination
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const canManage = user?.role === 'treasurer' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: treasury } = useQuery<Treasury>({
    queryKey: ['treasury'],
    queryFn: () => apiClient.get('/api/treasury/balance').then((r) => r.data),
  })

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ['treasury', 'transactions'],
    queryFn: () => apiClient.get('/api/treasury/transactions?limit=1000').then((r) => r.data),
    enabled: canManage,
  })

  // Gefilterte und sortierte Transaktionen (nach Datum absteigend)
  const filteredTransactions = useMemo(() => {
    if (!transactions) return []
    return transactions
      .filter(tx => {
        if (filterCategory && tx.category !== filterCategory) return false
        if (filterType === 'income' && tx.amount <= 0) return false
        if (filterType === 'expense' && tx.amount >= 0) return false
        return true
      })
      .sort((a, b) => {
        const dateA = a.transaction_date || a.created_at
        const dateB = b.transaction_date || b.created_at
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })
  }, [transactions, filterCategory, filterType])

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Laufender Stand berechnen (für die aktuelle Seite, rückwärts vom aktuellen Stand)
  const transactionsWithBalance = useMemo(() => {
    if (!treasury || !filteredTransactions.length) return []

    // Berechne den Stand vor der ersten Transaktion auf dieser Seite
    let runningBalance = treasury.current_balance

    // Subtrahiere alle Transaktionen vor der aktuellen Seite
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    for (let i = 0; i < startIndex; i++) {
      runningBalance -= filteredTransactions[i].amount
    }

    // Jetzt für jede Transaktion auf der Seite den Stand berechnen
    return paginatedTransactions.map((tx) => {
      const balance = runningBalance
      runningBalance -= tx.amount
      return { ...tx, runningBalance: balance }
    })
  }, [treasury, filteredTransactions, paginatedTransactions, currentPage])

  // Statistiken
  const stats = useMemo(() => {
    if (!transactions) return { totalIncome: 0, totalExpense: 0, transactionCount: 0 }
    const totalIncome = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
    const totalExpense = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0)
    return { totalIncome, totalExpense, transactionCount: transactions.length }
  }, [transactions])

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

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post<CSVImportResponse>('/api/treasury/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
      const result = response.data
      alert(`Import abgeschlossen: ${result.imported} importiert, ${result.skipped} übersprungen${result.errors.length > 0 ? `, ${result.errors.length} Fehler` : ''}`)
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Import-Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: () => apiClient.delete('/api/treasury/transactions/all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
      alert('Alle Transaktionen wurden gelöscht.')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const message = err.response?.data?.detail || err.message || 'Unbekannter Fehler'
      alert(`Fehler: ${message}`)
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (window.confirm(`CSV "${file.name}" importieren? Alle Zeilen werden als neue Transaktionen hinzugefügt.`)) {
        importMutation.mutate(file)
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteAll = () => {
    if (window.confirm('ACHTUNG: Alle Transaktionen werden unwiderruflich gelöscht und der Kassenstand auf 0 gesetzt. Fortfahren?')) {
      if (window.confirm('Bist du WIRKLICH sicher? Diese Aktion kann nicht rückgängig gemacht werden!')) {
        deleteAllMutation.mutate()
      }
    }
  }

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
    if (window.confirm(`Transaktion "${tx.description}" wirklich löschen?`)) {
      deleteMutation.mutate(tx.id)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Staffelkasse</h1>
        {canManage && !showForm && (
          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteAllMutation.isPending || !transactions?.length}
                  className="btn btn-secondary flex items-center gap-2 !text-red-400 hover:!bg-red-500/20"
                  title="Alle Transaktionen löschen"
                >
                  <Trash2 size={18} />
                  Alle löschen
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Upload size={18} />
                  {importMutation.isPending ? 'Importiere...' : 'CSV Import'}
                </button>
              </>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={18} />
              Transaktion
            </button>
          </div>
        )}
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card !p-4">
          <p className="text-gray-400 text-sm mb-1">Kassenstand</p>
          <p className="text-2xl font-bold text-krt-orange">
            {formatAmount(treasury?.current_balance || 0)} aUEC
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-gray-400 text-sm mb-1">Einnahmen (gesamt)</p>
          <p className="text-2xl font-bold text-emerald-400">
            +{formatAmount(stats.totalIncome)} aUEC
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-gray-400 text-sm mb-1">Ausgaben (gesamt)</p>
          <p className="text-2xl font-bold text-red-400">
            -{formatAmount(stats.totalExpense)} aUEC
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-gray-400 text-sm mb-1">Transaktionen</p>
          <p className="text-2xl font-bold text-white">
            {stats.transactionCount}
          </p>
        </div>
      </div>

      {/* Neue Transaktion Form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Neue Transaktion</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'income' })}
                className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                  formData.type === 'income'
                    ? 'border-emerald-500 bg-emerald-500/20'
                    : 'border-gray-700'
                }`}
              >
                <TrendingUp
                  className={`mx-auto mb-2 ${
                    formData.type === 'income' ? 'text-emerald-400' : 'text-gray-400'
                  }`}
                  size={28}
                />
                <p className="font-medium">Einnahme</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'expense' })}
                className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                  formData.type === 'expense'
                    ? 'border-red-500 bg-red-500/20'
                    : 'border-gray-700'
                }`}
              >
                <TrendingDown
                  className={`mx-auto mb-2 ${
                    formData.type === 'expense' ? 'text-red-400' : 'text-gray-400'
                  }`}
                  size={28}
                />
                <p className="font-medium">Ausgabe</p>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Betrag (aUEC)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="z.B. 5000000"
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Kategorie</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Kategorie wählen...</option>
                  {TRANSACTION_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Beschreibung / Event</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="z.B. Großzügige Spende von Silva-7"
                className="input"
                required
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

      {/* Filter */}
      {canManage && transactions && transactions.length > 0 && (
        <div className="card mb-4 !p-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-gray-400">
              <Filter size={18} />
              <span className="text-sm">Filter:</span>
            </div>

            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value as 'all' | 'income' | 'expense'); setCurrentPage(1) }}
              className="input !w-auto !py-1.5 text-sm"
            >
              <option value="all">Alle Typen</option>
              <option value="income">Nur Einnahmen</option>
              <option value="expense">Nur Ausgaben</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1) }}
              className="input !w-auto !py-1.5 text-sm"
            >
              <option value="">Alle Kategorien</option>
              {TRANSACTION_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {(filterType !== 'all' || filterCategory) && (
              <button
                onClick={() => { setFilterType('all'); setFilterCategory(''); setCurrentPage(1) }}
                className="text-sm text-krt-orange hover:text-krt-orange/80"
              >
                Filter zurücksetzen
              </button>
            )}

            <span className="text-sm text-gray-500 ml-auto">
              {filteredTransactions.length} Einträge
            </span>
          </div>
        </div>
      )}

      {/* Transaktions-Tabelle */}
      {canManage && (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800/80 border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Datum</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Event / Beschreibung</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Kategorie</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Wer</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Transaktion</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Stand</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-300 w-20">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {transactionsWithBalance.length > 0 ? (
                  transactionsWithBalance.map((tx, idx) => (
                    <tr
                      key={tx.id}
                      className={`border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                        idx % 2 === 0 ? 'bg-gray-900/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-sm text-gray-300 whitespace-nowrap">
                        {tx.transaction_date ? formatDate(tx.transaction_date) : formatDate(tx.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="max-w-xs">
                          <p className="text-sm text-white truncate" title={tx.description}>
                            {tx.description}
                          </p>
                          {tx.item_reference && tx.item_reference !== '-' && (
                            <p className="text-xs text-gray-500 truncate" title={tx.item_reference}>
                              {tx.item_reference}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {tx.category && (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            tx.category === 'Einzahlung' || tx.category === 'Spende'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : tx.category.includes('Beschaffung')
                              ? 'bg-blue-500/20 text-blue-400'
                              : tx.category.includes('Fitting')
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-gray-700 text-gray-300'
                          }`}>
                            {tx.category}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-300">
                        {tx.beneficiary && tx.beneficiary !== '-' ? tx.beneficiary : '-'}
                      </td>
                      <td className={`py-3 px-4 text-sm text-right font-mono font-medium whitespace-nowrap ${
                        tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {tx.amount > 0 ? '+' : ''}{formatAmount(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-mono text-krt-orange whitespace-nowrap">
                        {formatAmount(tx.runningBalance)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(tx)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                            title="Bearbeiten"
                          >
                            <Edit3 size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(tx)}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      {transactions?.length === 0
                        ? 'Noch keine Transaktionen vorhanden.'
                        : 'Keine Transaktionen entsprechen dem Filter.'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-800/50">
              <span className="text-sm text-gray-400">
                Seite {currentPage} von {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!canManage && (
        <div className="card text-center py-8">
          <p className="text-gray-400">
            Nur Kassenwarte und Admins können die Transaktions-Historie einsehen.
          </p>
        </div>
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
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    formData.type === 'income'
                      ? 'border-emerald-500 bg-emerald-500/20'
                      : 'border-gray-700'
                  }`}
                >
                  <TrendingUp
                    className={`mx-auto mb-1 ${
                      formData.type === 'income' ? 'text-emerald-400' : 'text-gray-400'
                    }`}
                    size={24}
                  />
                  <p className="font-medium text-sm">Einnahme</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'expense' })}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    formData.type === 'expense'
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-gray-700'
                  }`}
                >
                  <TrendingDown
                    className={`mx-auto mb-1 ${
                      formData.type === 'expense' ? 'text-red-400' : 'text-gray-400'
                    }`}
                    size={24}
                  />
                  <p className="font-medium text-sm">Ausgabe</p>
                </button>
              </div>

              <div>
                <label className="label">Betrag (aUEC)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Beschreibung</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Kategorie</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input"
                >
                  <option value="">Keine Kategorie</option>
                  {TRANSACTION_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
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
                  {updateMutation.isPending ? 'Speichern...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
