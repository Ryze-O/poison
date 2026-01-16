import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Minus, ArrowRight, Search, History, Package } from 'lucide-react'
import type { InventoryItem, User, Component } from '../api/types'

type InventoryAction = 'add' | 'remove' | 'loot' | 'transfer_in' | 'transfer_out'

interface InventoryLog {
  id: number
  user: User
  component: Component
  action: InventoryAction
  quantity: number
  quantity_before: number
  quantity_after: number
  related_user: User | null
  notes: string | null
  created_at: string
}

const actionLabels: Record<InventoryAction, string> = {
  add: 'Hinzugefügt',
  remove: 'Entfernt',
  loot: 'Loot erhalten',
  transfer_in: 'Transfer erhalten',
  transfer_out: 'Transfer gesendet',
}

const actionColors: Record<InventoryAction, string> = {
  add: 'text-sc-green',
  remove: 'text-sc-red',
  loot: 'text-sc-gold',
  transfer_in: 'text-sc-blue',
  transfer_out: 'text-purple-400',
}

export default function InventoryPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [showHistory, setShowHistory] = useState(false)
  const [transferModal, setTransferModal] = useState<{
    component: Component
    quantity: number
  } | null>(null)
  const [transferTo, setTransferTo] = useState<number | null>(null)
  const [transferAmount, setTransferAmount] = useState(1)
  const [addModal, setAddModal] = useState(false)
  const [selectedComponent, setSelectedComponent] = useState<number | null>(null)
  const [addQuantity, setAddQuantity] = useState(1)

  const canManage = user?.role !== 'member'

  const { data: myInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', 'my'],
    queryFn: () => apiClient.get('/api/inventory/my').then((r) => r.data),
    enabled: canManage,
  })

  const { data: allInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', 'all'],
    queryFn: () => apiClient.get('/api/inventory').then((r) => r.data),
  })

  const { data: officers } = useQuery<User[]>({
    queryKey: ['users', 'officers'],
    queryFn: () => apiClient.get('/api/users/officers').then((r) => r.data),
  })

  const { data: components } = useQuery<Component[]>({
    queryKey: ['components'],
    queryFn: () => apiClient.get('/api/components').then((r) => r.data),
  })

  const { data: categories } = useQuery<string[]>({
    queryKey: ['components', 'categories'],
    queryFn: () => apiClient.get('/api/components/categories').then((r) => r.data),
  })

  const { data: history } = useQuery<InventoryLog[]>({
    queryKey: ['inventory', 'history'],
    queryFn: () => apiClient.get('/api/inventory/history').then((r) => r.data),
    enabled: canManage && showHistory,
  })

  const addMutation = useMutation({
    mutationFn: ({ componentId, quantity }: { componentId: number; quantity: number }) =>
      apiClient.post(`/api/inventory/${componentId}/add?quantity=${quantity}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: ({ componentId, quantity }: { componentId: number; quantity: number }) =>
      apiClient.post(`/api/inventory/${componentId}/remove?quantity=${quantity}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const transferMutation = useMutation({
    mutationFn: (data: { to_user_id: number; component_id: number; quantity: number }) =>
      apiClient.post('/api/inventory/transfer', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setTransferModal(null)
      setTransferTo(null)
      setTransferAmount(1)
    },
  })

  // Filtern von myInventory
  const filteredMyInventory = myInventory?.filter((item) => {
    const matchesSearch = item.component.name
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesCategory =
      !filterCategory || item.component.category === filterCategory
    return matchesSearch && matchesCategory
  })

  // Inventar nach Benutzer gruppieren
  const inventoryByUser = allInventory?.reduce(
    (acc, item) => {
      const userId = item.user_id
      if (!acc[userId]) {
        acc[userId] = []
      }
      acc[userId].push(item)
      return acc
    },
    {} as Record<number, InventoryItem[]>
  )

  // Komponenten die noch nicht im Inventar sind
  const componentsNotInInventory = components?.filter(
    (c) => !myInventory?.some((item) => item.component.id === c.id)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Lager-Übersicht</h1>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`btn ${showHistory ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
            >
              <History size={20} />
              Historie
            </button>
            <button
              onClick={() => setAddModal(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={20} />
              Hinzufügen
            </button>
          </div>
        )}
      </div>

      {/* Such- und Filterleiste */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Komponente suchen..."
              className="input pl-10"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input md:w-48"
          >
            <option value="">Alle Kategorien</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Historie */}
      {showHistory && canManage && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Lager-Historie</h2>
          {history && history.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={actionColors[log.action]}>
                      {actionLabels[log.action]}
                    </span>
                    <span className="font-medium">{log.component.name}</span>
                    {log.related_user && (
                      <span className="text-gray-400">
                        {log.action === 'transfer_in' ? 'von' : 'an'}{' '}
                        {log.related_user.display_name || log.related_user.username}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-gray-400">
                    <span>
                      {log.quantity_before} → {log.quantity_after}
                    </span>
                    <span>
                      {new Date(log.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">Noch keine Historie vorhanden.</p>
          )}
        </div>
      )}

      {/* Mein Lager */}
      {canManage && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Mein Lager</h2>
          {filteredMyInventory && filteredMyInventory.length > 0 ? (
            <div className="space-y-3">
              {filteredMyInventory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{item.component.name}</p>
                    {item.component.category && (
                      <p className="text-sm text-gray-400">
                        {item.component.category}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          removeMutation.mutate({
                            componentId: item.component.id,
                            quantity: 1,
                          })
                        }
                        disabled={item.quantity <= 0}
                        className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-12 text-center text-lg font-bold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          addMutation.mutate({
                            componentId: item.component.id,
                            quantity: 1,
                          })
                        }
                        className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        setTransferModal({
                          component: item.component,
                          quantity: item.quantity,
                        })
                      }
                      className="p-2 bg-sc-blue/20 text-sc-blue rounded-lg hover:bg-sc-blue/30"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="mx-auto text-gray-600 mb-2" size={48} />
              <p className="text-gray-400">
                {search || filterCategory
                  ? 'Keine Komponenten gefunden.'
                  : 'Dein Lager ist leer.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Alle Lager */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Alle Lager</h2>
        {officers && inventoryByUser ? (
          <div className="space-y-6">
            {officers.map((officer) => {
              const items = inventoryByUser[officer.id]?.filter((item) => {
                const matchesSearch = item.component.name
                  .toLowerCase()
                  .includes(search.toLowerCase())
                const matchesCategory =
                  !filterCategory || item.component.category === filterCategory
                return matchesSearch && matchesCategory
              })
              if (!items || items.length === 0) return null
              return (
                <div key={officer.id}>
                  <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                    {officer.avatar && (
                      <img
                        src={officer.avatar}
                        alt=""
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    {officer.display_name || officer.username}
                    {officer.id === user?.id && (
                      <span className="text-xs text-gray-500">(Du)</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-gray-800/50 rounded-lg"
                      >
                        <p className="font-medium truncate">{item.component.name}</p>
                        <p className="text-sc-blue">{item.quantity}x</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-400">Keine Lagerbestände vorhanden.</p>
        )}
      </div>

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {transferModal.component.name} transferieren
            </h2>
            <p className="text-gray-400 mb-4">
              Verfügbar: {transferModal.quantity}
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">An wen?</label>
                <select
                  value={transferTo ?? ''}
                  onChange={(e) => setTransferTo(Number(e.target.value))}
                  className="input"
                >
                  <option value="">Benutzer wählen...</option>
                  {officers
                    ?.filter((o) => o.id !== user?.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.display_name || o.username}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="label">Menge</label>
                <input
                  type="number"
                  min={1}
                  max={transferModal.quantity}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  className="input"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setTransferModal(null)}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (transferTo) {
                      transferMutation.mutate({
                        to_user_id: transferTo,
                        component_id: transferModal.component.id,
                        quantity: transferAmount,
                      })
                    }
                  }}
                  disabled={!transferTo || transferMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {transferMutation.isPending ? 'Wird transferiert...' : 'Transferieren'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Komponente hinzufügen Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Komponente hinzufügen</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Komponente</label>
                <select
                  value={selectedComponent ?? ''}
                  onChange={(e) => setSelectedComponent(Number(e.target.value))}
                  className="input"
                >
                  <option value="">Komponente wählen...</option>
                  {componentsNotInInventory?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.category && `(${c.category})`}
                    </option>
                  ))}
                  <optgroup label="Bereits im Lager">
                    {myInventory?.map((item) => (
                      <option key={item.component.id} value={item.component.id}>
                        {item.component.name} (aktuell: {item.quantity})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="label">Menge</label>
                <input
                  type="number"
                  min={1}
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(Number(e.target.value))}
                  className="input"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setAddModal(false)
                    setSelectedComponent(null)
                    setAddQuantity(1)
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (selectedComponent) {
                      addMutation.mutate({
                        componentId: selectedComponent,
                        quantity: addQuantity,
                      })
                      setAddModal(false)
                      setSelectedComponent(null)
                      setAddQuantity(1)
                    }
                  }}
                  disabled={!selectedComponent || addMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {addMutation.isPending ? 'Wird hinzugefügt...' : 'Hinzufügen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
