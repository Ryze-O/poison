import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { MapPin, Plus, Edit2, Trash2, Package } from 'lucide-react'
import type { Location, InventoryItem, User } from '../api/types'

export default function LocationsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [editModal, setEditModal] = useState<Location | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Location | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })

  const canManage = user?.role !== 'member'
  const isAdmin = user?.role === 'admin'

  const { data: locations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
  })

  const { data: locationInventory } = useQuery<{
    location: Location
    items: InventoryItem[]
    total_items: number
  }>({
    queryKey: ['locations', selectedLocation, 'inventory'],
    queryFn: () =>
      apiClient.get(`/api/locations/${selectedLocation}/inventory`).then((r) => r.data),
    enabled: selectedLocation !== null,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiClient.post('/api/locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setCreateModal(false)
      setFormData({ name: '', description: '' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string } }) =>
      apiClient.patch(`/api/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditModal(null)
      setFormData({ name: '', description: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setDeleteConfirm(null)
      if (selectedLocation === deleteConfirm?.id) {
        setSelectedLocation(null)
      }
    },
  })

  const openEditModal = (location: Location) => {
    setFormData({ name: location.name, description: location.description || '' })
    setEditModal(location)
  }

  const openCreateModal = () => {
    setFormData({ name: '', description: '' })
    setCreateModal(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Standorte</h1>
        {canManage && (
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
            <Plus size={20} />
            Neuer Standort
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Standort-Liste */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Alle Standorte</h2>
            {locations && locations.length > 0 ? (
              <div className="space-y-2">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    onClick={() => setSelectedLocation(location.id)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedLocation === location.id
                        ? 'bg-sc-blue/20 border border-sc-blue'
                        : 'bg-gray-800/50 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MapPin
                          size={20}
                          className={
                            selectedLocation === location.id ? 'text-sc-blue' : 'text-gray-400'
                          }
                        />
                        <div>
                          <p className="font-medium">{location.name}</p>
                          {location.description && (
                            <p className="text-sm text-gray-400 truncate max-w-[150px]">
                              {location.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditModal(location)
                            }}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                          >
                            <Edit2 size={16} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteConfirm(location)
                              }}
                              className="p-2 text-gray-400 hover:text-sc-red hover:bg-gray-700 rounded"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MapPin className="mx-auto text-gray-600 mb-2" size={48} />
                <p className="text-gray-400">Noch keine Standorte erstellt.</p>
              </div>
            )}
          </div>
        </div>

        {/* Standort-Details */}
        <div className="lg:col-span-2">
          <div className="card">
            {selectedLocation && locationInventory ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <MapPin size={24} className="text-sc-blue" />
                    {locationInventory.location.name}
                  </h2>
                  <span className="text-gray-400">
                    {locationInventory.total_items} Items gesamt
                  </span>
                </div>
                {locationInventory.location.description && (
                  <p className="text-gray-400 mb-4">{locationInventory.location.description}</p>
                )}

                {locationInventory.items.length > 0 ? (
                  <div className="space-y-2">
                    {locationInventory.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{item.component.name}</p>
                          {item.component.category && (
                            <p className="text-sm text-gray-400">{item.component.category}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sc-blue font-bold">{item.quantity}x</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package className="mx-auto text-gray-600 mb-2" size={48} />
                    <p className="text-gray-400">Keine Items an diesem Standort.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <MapPin className="mx-auto text-gray-600 mb-2" size={48} />
                <p className="text-gray-400">
                  Wähle einen Standort aus, um die Items zu sehen.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Neuer Standort</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Carrack Alpha"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Beschreibung (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="z.B. Hauptschiff der Staffel"
                  className="input"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCreateModal(false)
                    setFormData({ name: '', description: '' })
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.name.trim() || createMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {createMutation.isPending ? 'Wird erstellt...' : 'Erstellen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Standort bearbeiten</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Beschreibung (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditModal(null)
                    setFormData({ name: '', description: '' })
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() =>
                    updateMutation.mutate({
                      id: editModal.id,
                      data: formData,
                    })
                  }
                  disabled={!formData.name.trim() || updateMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {updateMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 text-sc-red">Standort löschen?</h2>
            <p className="text-gray-400 mb-4">
              Möchtest du den Standort <strong>"{deleteConfirm.name}"</strong> wirklich löschen?
              Alle Items an diesem Standort werden auf "Kein Standort" gesetzt.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary flex-1">
                Abbrechen
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="btn bg-sc-red hover:bg-red-700 flex-1"
              >
                {deleteMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
