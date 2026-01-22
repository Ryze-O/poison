import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Edit3, Trash2, X, Upload, TrendingUp, TrendingDown, Filter, ChevronLeft, ChevronRight, Users, UserPlus, ArrowRightLeft } from 'lucide-react'
import type { Treasury, Transaction, TransactionType, CSVImportResponse, OfficerAccountsSummary, User } from '../api/types'

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
    officer_account_id: '' as string,
  })

  // Filter und Pagination
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Offizier-Konten State
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [accountFormData, setAccountFormData] = useState({
    user_id: '',
    initial_balance: '',
  })
  const [transferFormData, setTransferFormData] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
  })

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

  // Offizier-Konten
  const { data: officerAccounts } = useQuery<OfficerAccountsSummary>({
    queryKey: ['officer-accounts'],
    queryFn: () => apiClient.get('/api/officer-accounts').then((r) => r.data),
    enabled: canManage,
  })

  // Alle User (für Konto-Erstellung)
  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
    enabled: isAdmin && showAccountForm,
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
      officer_account_id?: number
    }) => apiClient.post('/api/treasury/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
      queryClient.invalidateQueries({ queryKey: ['officer-accounts'] })
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

  // Offizier-Konto Mutations
  const createAccountMutation = useMutation({
    mutationFn: (data: { user_id: number; initial_balance: number }) =>
      apiClient.post('/api/officer-accounts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officer-accounts'] })
      setShowAccountForm(false)
      setAccountFormData({ user_id: '', initial_balance: '' })
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/officer-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officer-accounts'] })
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const transferMutation = useMutation({
    mutationFn: (data: { from_account_id: number; to_account_id: number; amount: number; description: string }) =>
      apiClient.post('/api/officer-accounts/transfer', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officer-accounts'] })
      setShowTransferForm(false)
      setTransferFormData({ from_account_id: '', to_account_id: '', amount: '', description: '' })
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const setBalanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: number; balance: number }) =>
      apiClient.patch(`/api/officer-accounts/${id}/set-balance?balance=${balance}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officer-accounts'] })
      setSelectedAccountId(null)
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
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
      officer_account_id: '',
    })
  }

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx)
    setFormData({
      amount: Math.abs(tx.amount).toString(),
      type: tx.transaction_type,
      description: tx.description,
      category: tx.category || '',
      officer_account_id: '',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      amount: parseFloat(formData.amount),
      transaction_type: formData.type,
      description: formData.description,
      category: formData.category || undefined,
      officer_account_id: formData.officer_account_id ? parseInt(formData.officer_account_id) : undefined,
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

      {/* Kassenwart-Kontostände */}
      {canManage && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} className="text-krt-orange" />
              Kassenwart-Kontostände
            </h2>
            <div className="flex items-center gap-2">
              {officerAccounts && officerAccounts.accounts.length > 1 && (
                <button
                  onClick={() => setShowTransferForm(true)}
                  className="btn btn-secondary flex items-center gap-2 text-sm"
                >
                  <ArrowRightLeft size={16} />
                  Transfer
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowAccountForm(true)}
                  className="btn btn-secondary flex items-center gap-2 text-sm"
                >
                  <UserPlus size={16} />
                  Konto
                </button>
              )}
            </div>
          </div>

          {officerAccounts && officerAccounts.accounts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {officerAccounts.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="element p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {account.user.avatar ? (
                        <img
                          src={account.user.avatar}
                          alt={account.user.username}
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold">
                          {(account.user.display_name || account.user.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">
                          {account.user.display_name || account.user.username}
                        </p>
                        <p className="text-xs text-krt-orange">
                          Kassenwart
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-bold ${account.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatAmount(account.balance)} aUEC
                      </p>
                      {isAdmin && (
                        <button
                          onClick={() => setSelectedAccountId(account.id)}
                          className="text-xs text-gray-400 hover:text-krt-orange"
                        >
                          Bearbeiten
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
                <span className="text-gray-400">Gesamt bei Kassenwarten:</span>
                <span className="font-mono font-bold text-lg text-krt-orange">
                  {formatAmount(officerAccounts.total_balance)} aUEC
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-gray-400">
                {isAdmin
                  ? 'Noch keine Kassenwart-Konten vorhanden. Klicke auf "Konto" um ein Konto zu erstellen.'
                  : 'Noch keine Kassenwart-Konten vorhanden.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Neues Offizier-Konto erstellen */}
      {showAccountForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Neues Kassenwart-Konto</h2>
              <button onClick={() => setShowAccountForm(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                createAccountMutation.mutate({
                  user_id: parseInt(accountFormData.user_id),
                  initial_balance: parseFloat(accountFormData.initial_balance) || 0,
                })
              }}
              className="space-y-4"
            >
              <div>
                <label className="label">Kassenwart</label>
                <select
                  value={accountFormData.user_id}
                  onChange={(e) => setAccountFormData({ ...accountFormData, user_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Kassenwart wählen...</option>
                  {allUsers
                    ?.filter((u) => !officerAccounts?.accounts.some((a) => a.user.id === u.id))
                    .filter((u) => u.is_treasurer || u.role === 'admin')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name || u.username} {u.role === 'admin' && '(Admin)'}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="label">Anfangsstand (aUEC)</label>
                <input
                  type="number"
                  value={accountFormData.initial_balance}
                  onChange={(e) => setAccountFormData({ ...accountFormData, initial_balance: e.target.value })}
                  placeholder="0"
                  className="input"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAccountForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createAccountMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {createAccountMutation.isPending ? 'Erstelle...' : 'Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer zwischen Kassenwart-Konten */}
      {showTransferForm && officerAccounts && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Transfer zwischen Kassenwarten</h2>
              <button onClick={() => setShowTransferForm(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                transferMutation.mutate({
                  from_account_id: parseInt(transferFormData.from_account_id),
                  to_account_id: parseInt(transferFormData.to_account_id),
                  amount: parseFloat(transferFormData.amount),
                  description: transferFormData.description,
                })
              }}
              className="space-y-4"
            >
              <div>
                <label className="label">Von Konto</label>
                <select
                  value={transferFormData.from_account_id}
                  onChange={(e) => setTransferFormData({ ...transferFormData, from_account_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Sender wählen...</option>
                  {officerAccounts.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.user.display_name || a.user.username} ({formatAmount(a.balance)} aUEC)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">An Konto</label>
                <select
                  value={transferFormData.to_account_id}
                  onChange={(e) => setTransferFormData({ ...transferFormData, to_account_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Empfänger wählen...</option>
                  {officerAccounts.accounts
                    .filter((a) => a.id.toString() !== transferFormData.from_account_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.user.display_name || a.user.username}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="label">Betrag (aUEC)</label>
                <input
                  type="number"
                  min="1"
                  value={transferFormData.amount}
                  onChange={(e) => setTransferFormData({ ...transferFormData, amount: e.target.value })}
                  placeholder="z.B. 5000000"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Beschreibung</label>
                <input
                  type="text"
                  value={transferFormData.description}
                  onChange={(e) => setTransferFormData({ ...transferFormData, description: e.target.value })}
                  placeholder="z.B. Überweisung Staffelkasse"
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowTransferForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={transferMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {transferMutation.isPending ? 'Überweise...' : 'Überweisen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kontostand bearbeiten Modal */}
      {selectedAccountId && officerAccounts && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            {(() => {
              const account = officerAccounts.accounts.find((a) => a.id === selectedAccountId)
              if (!account) return null
              return (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">
                      Konto: {account.user.display_name || account.user.username}
                    </h2>
                    <button onClick={() => setSelectedAccountId(null)} className="text-gray-400 hover:text-white">
                      <X size={24} />
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const input = (e.target as HTMLFormElement).elements.namedItem('balance') as HTMLInputElement
                      setBalanceMutation.mutate({
                        id: selectedAccountId,
                        balance: parseFloat(input.value),
                      })
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="label">Aktueller Stand</label>
                      <p className="text-2xl font-mono font-bold text-krt-orange mb-4">
                        {formatAmount(account.balance)} aUEC
                      </p>
                    </div>

                    <div>
                      <label className="label">Neuer Stand (aUEC)</label>
                      <input
                        type="number"
                        name="balance"
                        defaultValue={account.balance}
                        className="input"
                        required
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Konto von ${account.user.display_name || account.user.username} wirklich löschen?`)) {
                            deleteAccountMutation.mutate(selectedAccountId)
                            setSelectedAccountId(null)
                          }
                        }}
                        className="btn btn-secondary !text-red-400 hover:!bg-red-500/20"
                      >
                        Löschen
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAccountId(null)}
                        className="btn btn-secondary flex-1"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        disabled={setBalanceMutation.isPending}
                        className="btn btn-primary flex-1"
                      >
                        {setBalanceMutation.isPending ? 'Speichern...' : 'Speichern'}
                      </button>
                    </div>
                  </form>
                </>
              )
            })()}
          </div>
        </div>
      )}

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

            {/* Kassenwart-Auswahl bei Ausgaben */}
            {formData.type === 'expense' && officerAccounts && officerAccounts.accounts.length > 0 && (
              <div>
                <label className="label">Von Kassenwart-Konto abbuchen</label>
                <select
                  value={formData.officer_account_id}
                  onChange={(e) => setFormData({ ...formData, officer_account_id: e.target.value })}
                  className="input"
                >
                  <option value="">-- Kein Konto (Staffelkasse) --</option>
                  {officerAccounts.accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.user.display_name || account.user.username} ({formatAmount(account.balance)} aUEC)
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-400 mt-1">
                  Optional: Wähle ein Kassenwart-Konto, von dem der Betrag abgezogen werden soll.
                </p>
              </div>
            )}

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
