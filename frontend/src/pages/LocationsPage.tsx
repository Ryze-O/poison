import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { MapPin, Plus, Edit2, Trash2, Package, Search, Globe, Building } from 'lucide-react'
import type { Location, InventoryItem } from '../api/types'

export default function LocationsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [editModal, setEditModal] = useState<Location | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Location | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_name: '',
    planet_name: '',
    location_type: '',
  })

  // Filter
  const [search, setSearch] = useState('')
  const [filterSystem, setFilterSystem] = useState('')
  const [filterPlanet, setFilterPlanet] = useState('')
  const [filterType, setFilterType] = useState('')

  const canManage = user?.role !== 'member'
  const isAdmin = user?.role === 'admin'

  const { data: locations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
  })

  const { data: systems } = useQuery<string[]>({
    queryKey: ['locations', 'systems'],
    queryFn: () => apiClient.get('/api/locations/systems').then((r) => r.data),
  })

  const { data: planets } = useQuery<string[]>({
    queryKey: ['locations', 'planets', filterSystem],
    queryFn: () =>
      apiClient
        .get('/api/locations/planets', { params: filterSystem ? { system_name: filterSystem } : {} })
        .then((r) => r.data),
  })

  const { data: locationTypes } = useQuery<string[]>({
    queryKey: ['locations', 'types'],
    queryFn: () => apiClient.get('/api/locations/types').then((r) => r.data),
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
    mutationFn: (data: {
      name: string
      description: string
      system_name?: string
      planet_name?: string
      location_type?: string
    }) => apiClient.post('/api/locations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setCreateModal(false)
      setFormData({ name: '', description: '', system_name: '', planet_name: '', location_type: '' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string } }) =>
      apiClient.patch(`/api/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      setEditModal(null)
      setFormData({ name: '', description: '', system_name: '', planet_name: '', location_type: '' })
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
    setFormData({
      name: location.name,
      description: location.description || '',
      system_name: location.system_name || '',
      planet_name: location.planet_name || '',
      location_type: location.location_type || ''
    })
    setEditModal(location)
  }

  const openCreateModal = () => {
    setFormData({ name: '', description: '', system_name: '', planet_name: '', location_type: '' })
    setCreateModal(true)
  }

  // Filtern
  const filteredLocations = locations?.filter((loc) => {
    const matchesSearch =
      !search ||
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.planet_name?.toLowerCase().includes(search.toLowerCase())
    const matchesSystem = !filterSystem || loc.system_name === filterSystem
    const matchesPlanet = !filterPlanet || loc.planet_name === filterPlanet
    const matchesType = !filterType || loc.location_type === filterType
    return matchesSearch && matchesSystem && matchesPlanet && matchesType
  })

  // Nach System und Planet gruppieren
  const groupedLocations = filteredLocations?.reduce(
    (acc, loc) => {
      const system = loc.system_name || 'Andere'
      const planet = loc.planet_name || 'Unbekannt'
      const key = `${system}|${planet}`
      if (!acc[key]) {
        acc[key] = { system, planet, locations: [] }
      }
      acc[key].locations.push(loc)
      return acc
    },
    {} as Record<string, { system: string; planet: string; locations: Location[] }>
  )

  const getTypeIcon = (type: string | null) => {
    switch (type) {
      case 'City':
        return <Building size={16} className="text-sc-gold" />
      case 'Station':
        return <Globe size={16} className="text-krt-orange" />
      default:
        return <MapPin size={16} className="text-gray-400" />
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Standorte</h1>
        {canManage && (
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
            <Plus size={20} />
            Eigener Standort
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Standort suchen..."
              className="input pl-10"
            />
          </div>
          <select
            value={filterSystem}
            onChange={(e) => {
              setFilterSystem(e.target.value)
              setFilterPlanet('')
            }}
            className="input md:w-40"
          >
            <option value="">Alle Systeme</option>
            {systems?.map((sys) => (
              <option key={sys} value={sys}>
                {sys}
              </option>
            ))}
          </select>
          <select
            value={filterPlanet}
            onChange={(e) => setFilterPlanet(e.target.value)}
            className="input md:w-40"
          >
            <option value="">Alle Planeten</option>
            {planets?.map((planet) => (
              <option key={planet} value={planet}>
                {planet}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input md:w-40"
          >
            <option value="">Alle Typen</option>
            {locationTypes?.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        {(filterSystem || filterPlanet || filterType) && (
          <p className="mt-3 text-sm text-gray-400">
            {filteredLocations?.length || 0} Standorte gefunden
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Standort-Liste */}
        <div className="lg:col-span-1 space-y-4">
          {groupedLocations && Object.keys(groupedLocations).length > 0 ? (
            Object.entries(groupedLocations)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, group]) => (
                <div key={key} className="card">
                  <h3 className="text-sm font-bold mb-3 text-gray-400 flex items-center gap-2">
                    <Globe size={14} />
                    {group.system} / {group.planet}
                  </h3>
                  <div className="space-y-2">
                    {group.locations.map((location) => (
                      <div
                        key={location.id}
                        onClick={() => setSelectedLocation(location.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedLocation === location.id
                            ? 'bg-krt-orange/20 border border-krt-orange'
                            : 'bg-gray-800/50 hover:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {getTypeIcon(location.location_type)}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{location.name}</p>
                              <p className="text-xs text-krt-orange/70">
                                {location.location_type || 'Custom'}
                                {location.is_predefined && ' • SC'}
                              </p>
                            </div>
                          </div>
                          {canManage && !location.is_predefined && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditModal(location)
                                }}
                                className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                              >
                                <Edit2 size={14} />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDeleteConfirm(location)
                                  }}
                                  className="p-1 text-gray-400 hover:text-sc-red hover:bg-gray-700 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
          ) : (
            <div className="card text-center py-8">
              <MapPin className="mx-auto text-gray-600 mb-2" size={48} />
              <p className="text-gray-400">
                {search || filterSystem || filterPlanet || filterType
                  ? 'Keine Standorte gefunden.'
                  : 'Noch keine Standorte erstellt.'}
              </p>
            </div>
          )}
        </div>

        {/* Standort-Details */}
        <div className="lg:col-span-2">
          <div className="card">
            {selectedLocation && locationInventory ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      {getTypeIcon(locationInventory.location.location_type)}
                      {locationInventory.location.name}
                    </h2>
                    <p className="text-sm text-gray-400">
                      {[
                        locationInventory.location.system_name,
                        locationInventory.location.planet_name,
                        locationInventory.location.location_type,
                      ]
                        .filter(Boolean)
                        .join(' / ')}
                    </p>
                  </div>
                  <span className="text-gray-400">{locationInventory.total_items} Items</span>
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
                          <p className="text-krt-orange font-bold">{item.quantity}x</p>
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
          <div className="card max-w-lg w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Eigener Standort</h2>
            <p className="text-sm text-gray-400 mb-4">
              Erstelle einen eigenen Standort (z.B. dein Schiff oder eine persönliche Basis).
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Meine Carrack"
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Sternensystem</label>
                  <input
                    type="text"
                    value={formData.system_name}
                    onChange={(e) => setFormData({ ...formData, system_name: e.target.value })}
                    placeholder="z.B. Stanton, Pyro"
                    className="input"
                    list="systems-list"
                  />
                  <datalist id="systems-list">
                    <option value="Stanton" />
                    <option value="Pyro" />
                    <option value="Nyx" />
                  </datalist>
                </div>
                <div>
                  <label className="label">Planet/Mond</label>
                  <input
                    type="text"
                    value={formData.planet_name}
                    onChange={(e) => setFormData({ ...formData, planet_name: e.target.value })}
                    placeholder="z.B. Hurston, Crusader"
                    className="input"
                    list="planets-list"
                  />
                  <datalist id="planets-list">
                    {planets?.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="label">Typ</label>
                <select
                  value={formData.location_type}
                  onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                  className="input"
                >
                  <option value="">-- Typ wählen --</option>
                  <option value="Ship">Schiff</option>
                  <option value="Station">Station</option>
                  <option value="City">Stadt</option>
                  <option value="Outpost">Außenposten</option>
                  <option value="Custom">Sonstiges</option>
                </select>
              </div>

              <div>
                <label className="label">Beschreibung (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="z.B. Hauptschiff für Org-Ops"
                  className="input"
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCreateModal(false)
                    setFormData({ name: '', description: '', system_name: '', planet_name: '', location_type: '' })
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() =>
                    createMutation.mutate({
                      name: formData.name,
                      description: formData.description,
                      system_name: formData.system_name || undefined,
                      planet_name: formData.planet_name || undefined,
                      location_type: formData.location_type || undefined,
                    })
                  }
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
                    setFormData({ name: '', description: '', system_name: '', planet_name: '', location_type: '' })
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
