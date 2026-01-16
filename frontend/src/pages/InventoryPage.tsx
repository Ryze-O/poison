import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Minus, ArrowRight } from 'lucide-react'
import type { InventoryItem, User, Component } from '../api/types'

export default function InventoryPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [transferModal, setTransferModal] = useState<{
    component: Component
    quantity: number
  } | null>(null)
  const [transferTo, setTransferTo] = useState<number | null>(null)
  const [transferAmount, setTransferAmount] = useState(1)

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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Lager-Übersicht</h1>

      {/* Mein Lager */}
      {canManage && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Mein Lager</h2>
          {myInventory && myInventory.length > 0 ? (
            <div className="space-y-3">
              {myInventory.map((item) => (
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
            <p className="text-gray-400">Dein Lager ist leer.</p>
          )}
        </div>
      )}

      {/* Alle Lager */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Alle Lager</h2>
        {officers && inventoryByUser ? (
          <div className="space-y-6">
            {officers.map((officer) => {
              const items = inventoryByUser[officer.id]
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
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-gray-800/50 rounded-lg"
                      >
                        <p className="font-medium">{item.component.name}</p>
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
    </div>
  )
}
