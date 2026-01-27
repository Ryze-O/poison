import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Minus, ArrowRight, Search, History, Package, MapPin, ArrowRightLeft, ChevronDown, ChevronRight } from 'lucide-react'
import type { InventoryItem, User, Component, Location } from '../api/types'

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
  transfer_in: 'text-krt-orange',
  transfer_out: 'text-purple-400',
}

export default function InventoryPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterLocation, setFilterLocation] = useState<string>('')
  const [showHistory, setShowHistory] = useState(false)
  const [transferModal, setTransferModal] = useState<{
    component: Component
    quantity: number
    locationId: number | null
  } | null>(null)
  const [transferTo, setTransferTo] = useState<number | null>(null)
  const [transferAmount, setTransferAmount] = useState(1)
  const [transferToLocation, setTransferToLocation] = useState<number | null>(null)
  const [transferConfirming, setTransferConfirming] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [bulkMoveModal, setBulkMoveModal] = useState(false)
  const [bulkFromLocation, setBulkFromLocation] = useState<number | null>(null)
  const [bulkToLocation, setBulkToLocation] = useState<number | null>(null)
  // Patch-Reset Modal
  const [patchModal, setPatchModal] = useState(false)
  const [patchNewLocation, setPatchNewLocation] = useState<number | null>(null)
  const [patchKeptItems, setPatchKeptItems] = useState<Set<number>>(new Set())
  const [filterSubCategory, setFilterSubCategory] = useState<string>('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set())
  const [editingUserId, setEditingUserId] = useState<number | null>(null)

  // Effektive Rolle (berücksichtigt Vorschaumodus)
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const canManage = effectiveRole !== 'member' && effectiveRole !== 'guest' && effectiveRole !== 'loot_guest'
  const isAdmin = effectiveRole === 'admin'

  const toggleUser = (userId: number) => {
    setExpandedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

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

  const { data: subCategories } = useQuery<string[]>({
    queryKey: ['components', 'sub-categories', filterCategory],
    queryFn: () => {
      const url = filterCategory
        ? `/api/items/sub-categories?category=${encodeURIComponent(filterCategory)}`
        : '/api/items/sub-categories'
      return apiClient.get(url).then((r) => r.data)
    },
  })

  const { data: manufacturers } = useQuery<string[]>({
    queryKey: ['components', 'manufacturers'],
    queryFn: () => apiClient.get('/api/components/manufacturers').then((r) => r.data),
  })

  const { data: locations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
  })

  const { data: history } = useQuery<InventoryLog[]>({
    queryKey: ['inventory', 'history'],
    queryFn: () => apiClient.get('/api/inventory/history').then((r) => r.data),
    enabled: canManage && showHistory,
  })

  const addMutation = useMutation({
    mutationFn: ({ componentId, quantity, locationId }: { componentId: number; quantity: number; locationId?: number | null }) => {
      let url = `/api/inventory/${componentId}/add?quantity=${quantity}`
      if (locationId) url += `&location_id=${locationId}`
      return apiClient.post(url)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: ({ componentId, quantity, locationId }: { componentId: number; quantity: number; locationId?: number | null }) => {
      let url = `/api/inventory/${componentId}/remove?quantity=${quantity}`
      if (locationId) url += `&location_id=${locationId}`
      return apiClient.post(url)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  // Admin: Anderes User-Inventar bearbeiten
  const adminAddMutation = useMutation({
    mutationFn: ({ userId, componentId, quantity, locationId }: { userId: number; componentId: number; quantity: number; locationId?: number | null }) => {
      let url = `/api/inventory/admin/${userId}/${componentId}/add?quantity=${quantity}`
      if (locationId) url += `&location_id=${locationId}`
      return apiClient.post(url)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const adminRemoveMutation = useMutation({
    mutationFn: ({ userId, componentId, quantity, locationId }: { userId: number; componentId: number; quantity: number; locationId?: number | null }) => {
      let url = `/api/inventory/admin/${userId}/${componentId}/remove?quantity=${quantity}`
      if (locationId) url += `&location_id=${locationId}`
      return apiClient.post(url)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const transferMutation = useMutation({
    mutationFn: (data: { to_user_id: number; component_id: number; quantity: number; to_location_id?: number | null }) =>
      apiClient.post('/api/inventory/transfer', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setTransferModal(null)
      setTransferTo(null)
      setTransferAmount(1)
      setTransferToLocation(null)
      setTransferConfirming(false)
    },
  })

  const bulkMoveMutation = useMutation({
    mutationFn: (data: { from_location_id: number | null; to_location_id: number | null }) =>
      apiClient.post('/api/inventory/bulk-move-location', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setBulkMoveModal(false)
      setBulkFromLocation(null)
      setBulkToLocation(null)
    },
  })

  const patchResetMutation = useMutation({
    mutationFn: (data: { new_location_id: number; kept_item_ids: number[] }) =>
      apiClient.post('/api/inventory/patch-reset', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setPatchModal(false)
      setPatchNewLocation(null)
      setPatchKeptItems(new Set())
    },
  })

  // Filtern von myInventory
  const filteredMyInventory = myInventory?.filter((item) => {
    const matchesSearch = item.component.name
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesCategory =
      !filterCategory || item.component.category === filterCategory
    const matchesSubCategory =
      !filterSubCategory || item.component.sub_category === filterSubCategory
    const matchesLocation =
      filterLocation === '' ||
      (filterLocation === '0' && !item.location) ||
      (filterLocation !== '0' && item.location?.id === parseInt(filterLocation))
    return matchesSearch && matchesCategory && matchesSubCategory && matchesLocation
  })

  // Gruppiere Inventar nach Kategorie und Unterkategorie
  const groupedMyInventory = useMemo(() => {
    if (!filteredMyInventory) return {}

    const grouped: Record<string, Record<string, InventoryItem[]>> = {}

    filteredMyInventory.forEach((item) => {
      const category = item.component.category || 'Sonstige'
      const subCategory = item.component.sub_category || 'Allgemein'

      if (!grouped[category]) {
        grouped[category] = {}
      }
      if (!grouped[category][subCategory]) {
        grouped[category][subCategory] = []
      }
      grouped[category][subCategory].push(item)
    })

    // Sortiere Items innerhalb jeder Gruppe
    Object.keys(grouped).forEach(cat => {
      Object.keys(grouped[cat]).forEach(subCat => {
        grouped[cat][subCat].sort((a, b) => a.component.name.localeCompare(b.component.name))
      })
    })

    return grouped
  }, [filteredMyInventory])

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
              onClick={() => {
                // Alle Items vorauswählen
                if (myInventory) {
                  setPatchKeptItems(new Set(myInventory.map(i => i.id)))
                }
                setPatchModal(true)
              }}
              className="btn bg-amber-600 hover:bg-amber-500 flex items-center gap-2"
              title="Nach einem Patch: Items abgleichen und neue Homelocation setzen"
            >
              <Package size={20} />
              Patch
            </button>
            <button
              onClick={() => setBulkMoveModal(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowRightLeft size={20} />
              Standort wechseln
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
            onChange={(e) => {
              setFilterCategory(e.target.value)
              setFilterSubCategory('') // Reset Subkategorie bei Kategorie-Wechsel
            }}
            className="input md:w-40"
          >
            <option value="">Alle Kategorien</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {subCategories && subCategories.length > 0 && (
            <select
              value={filterSubCategory}
              onChange={(e) => setFilterSubCategory(e.target.value)}
              className="input md:w-40"
            >
              <option value="">Alle Unterkategorien</option>
              {subCategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          )}
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="input md:w-40"
          >
            <option value="">Alle Standorte</option>
            <option value="0">Ohne Standort</option>
            {locations?.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
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
            <div className="space-y-4">
              {Object.entries(groupedMyInventory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, subCategories]) => {
                  const isExpanded = expandedCategories.has(category)
                  const totalInCategory = Object.values(subCategories).flat().reduce((sum, item) => sum + item.quantity, 0)

                  return (
                    <div key={category} className="border border-gray-700/50 rounded-lg overflow-hidden">
                      {/* Kategorie-Header */}
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between p-3 bg-gray-800/70 hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown size={18} className="text-krt-orange" />
                          ) : (
                            <ChevronRight size={18} className="text-gray-400" />
                          )}
                          <span className="font-medium">{category}</span>
                        </div>
                        <span className="text-sm text-gray-400">
                          {totalInCategory} Items
                        </span>
                      </button>

                      {/* Unterkategorien und Items */}
                      {isExpanded && (
                        <div className="p-3 space-y-3">
                          {Object.entries(subCategories)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([subCategory, items]) => (
                              <div key={subCategory}>
                                {/* Unterkategorie-Header */}
                                <h4 className="text-sm font-medium text-gray-400 mb-2 border-b border-gray-700/50 pb-1">
                                  {subCategory}
                                  <span className="ml-2 text-xs text-gray-500">
                                    ({items.reduce((sum, i) => sum + i.quantity, 0)})
                                  </span>
                                </h4>

                                {/* Items */}
                                <div className="space-y-2">
                                  {items.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg"
                                    >
                                      <div>
                                        <p className="font-medium text-sm">{item.component.name}</p>
                                        {item.location && (
                                          <span className="flex items-center gap-1 text-xs text-gray-500">
                                            <MapPin size={10} />
                                            {item.location.name}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() =>
                                              removeMutation.mutate({
                                                componentId: item.component.id,
                                                quantity: 1,
                                                locationId: item.location?.id,
                                              })
                                            }
                                            disabled={item.quantity <= 0}
                                            className="p-1.5 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                                          >
                                            <Minus size={14} />
                                          </button>
                                          <span className="w-10 text-center font-bold">
                                            {item.quantity}
                                          </span>
                                          <button
                                            onClick={() =>
                                              addMutation.mutate({
                                                componentId: item.component.id,
                                                quantity: 1,
                                                locationId: item.location?.id,
                                              })
                                            }
                                            className="p-1.5 bg-gray-700 rounded hover:bg-gray-600"
                                          >
                                            <Plus size={14} />
                                          </button>
                                        </div>
                                        <button
                                          onClick={() =>
                                            setTransferModal({
                                              component: item.component,
                                              quantity: item.quantity,
                                              locationId: item.location?.id ?? null,
                                            })
                                          }
                                          className="p-1.5 bg-krt-orange/20 text-krt-orange rounded hover:bg-krt-orange/30"
                                        >
                                          <ArrowRight size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="mx-auto text-gray-600 mb-2" size={48} />
              <p className="text-gray-400">
                {search || filterCategory || filterSubCategory
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
          <div className="space-y-3">
            {officers.map((officer) => {
              const items = inventoryByUser[officer.id]?.filter((item) => {
                const matchesSearch = item.component.name
                  .toLowerCase()
                  .includes(search.toLowerCase())
                const matchesCategory =
                  !filterCategory || item.component.category === filterCategory
                const matchesLocation =
                  filterLocation === '' ||
                  (filterLocation === '0' && !item.location) ||
                  (filterLocation !== '0' && item.location?.id === parseInt(filterLocation))
                return matchesSearch && matchesCategory && matchesLocation
              })
              if (!items || items.length === 0) return null

              // Gruppiere nach Kategorie
              const byCategory: Record<string, InventoryItem[]> = {}
              items.forEach(item => {
                const cat = item.component.category || 'Sonstige'
                if (!byCategory[cat]) byCategory[cat] = []
                byCategory[cat].push(item)
              })

              const isExpanded = expandedUsers.has(officer.id)
              const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
              const isEditing = editingUserId === officer.id

              return (
                <div key={officer.id} className="border border-gray-700/50 rounded-lg overflow-hidden">
                  {/* User Header - Collapsed View */}
                  <button
                    onClick={() => toggleUser(officer.id)}
                    className="w-full flex items-center justify-between p-3 bg-gray-800/70 hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown size={18} className="text-krt-orange" />
                      ) : (
                        <ChevronRight size={18} className="text-gray-400" />
                      )}
                      {officer.avatar && (
                        <img
                          src={officer.avatar}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="font-medium">
                        {officer.display_name || officer.username}
                        {officer.id === user?.id && (
                          <span className="text-xs text-gray-500 ml-1">(Du)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Kategorien-Tags (collapsed) */}
                      {!isExpanded && (
                        <div className="flex gap-1 flex-wrap justify-end">
                          {Object.entries(byCategory).slice(0, 4).map(([cat, catItems]) => (
                            <span
                              key={cat}
                              className="text-xs px-2 py-0.5 bg-gray-700/50 rounded text-gray-300"
                            >
                              {cat}: {catItems.reduce((s, i) => s + i.quantity, 0)}
                            </span>
                          ))}
                          {Object.keys(byCategory).length > 4 && (
                            <span className="text-xs px-2 py-0.5 bg-gray-700/50 rounded text-gray-400">
                              +{Object.keys(byCategory).length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      <span className="text-sm text-gray-400 whitespace-nowrap">
                        {totalItems} Items
                      </span>
                    </div>
                  </button>

                  {/* Expanded View */}
                  {isExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Admin Edit Toggle */}
                      {isAdmin && officer.id !== user?.id && (
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingUserId(isEditing ? null : officer.id)
                            }}
                            className={`btn text-sm ${isEditing ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {isEditing ? 'Bearbeiten beenden' : 'Lager bearbeiten'}
                          </button>
                        </div>
                      )}

                      {/* Kategorien */}
                      {Object.entries(byCategory)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([category, catItems]) => (
                          <div key={category}>
                            <h4 className="text-sm font-medium text-gray-400 mb-2 border-b border-gray-700/50 pb-1">
                              {category}
                              <span className="ml-2 text-xs text-gray-500">
                                ({catItems.reduce((sum, i) => sum + i.quantity, 0)})
                              </span>
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {catItems
                                .sort((a, b) => a.component.name.localeCompare(b.component.name))
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className="p-3 bg-gray-800/30 rounded-lg"
                                  >
                                    <p className="font-medium text-sm truncate">{item.component.name}</p>
                                    <div className="flex items-center justify-between mt-1">
                                      {isEditing ? (
                                        // Admin Edit Controls
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() =>
                                              adminRemoveMutation.mutate({
                                                userId: officer.id,
                                                componentId: item.component.id,
                                                quantity: 1,
                                                locationId: item.location?.id,
                                              })
                                            }
                                            disabled={item.quantity <= 0 || adminRemoveMutation.isPending}
                                            className="p-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                                          >
                                            <Minus size={12} />
                                          </button>
                                          <span className="w-8 text-center text-sm font-bold text-krt-orange">
                                            {item.quantity}
                                          </span>
                                          <button
                                            onClick={() =>
                                              adminAddMutation.mutate({
                                                userId: officer.id,
                                                componentId: item.component.id,
                                                quantity: 1,
                                                locationId: item.location?.id,
                                              })
                                            }
                                            disabled={adminAddMutation.isPending}
                                            className="p-1 bg-gray-700 rounded hover:bg-gray-600"
                                          >
                                            <Plus size={12} />
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="text-krt-orange font-medium">{item.quantity}x</p>
                                      )}
                                      {item.location && (
                                        <span className="flex items-center gap-1 text-xs text-gray-400">
                                          <MapPin size={10} />
                                          {item.location.name}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
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

            {!transferConfirming ? (
              // Schritt 1: Eingabe
              <>
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
                    <label className="label">Ziel-Standort (optional)</label>
                    <select
                      value={transferToLocation ?? ''}
                      onChange={(e) => setTransferToLocation(e.target.value ? Number(e.target.value) : null)}
                      className="input"
                    >
                      <option value="">Kein Standort</option>
                      {locations?.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
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
                      onClick={() => {
                        setTransferModal(null)
                        setTransferToLocation(null)
                        setTransferConfirming(false)
                      }}
                      className="btn btn-secondary flex-1"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => setTransferConfirming(true)}
                      disabled={!transferTo}
                      className="btn btn-primary flex-1"
                    >
                      Weiter
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Schritt 2: Bestätigung
              <>
                <div className="p-4 bg-gray-800/50 rounded-lg mb-4 space-y-2">
                  <p className="text-lg font-medium text-center">
                    Transfer bestätigen
                  </p>
                  <div className="text-center space-y-1">
                    <p className="text-krt-orange font-bold text-xl">
                      {transferAmount}x {transferModal.component.name}
                    </p>
                    <p className="text-gray-400">an</p>
                    <p className="font-medium text-lg">
                      {officers?.find(o => o.id === transferTo)?.display_name ||
                       officers?.find(o => o.id === transferTo)?.username}
                    </p>
                    {transferToLocation && (
                      <>
                        <p className="text-gray-400">nach</p>
                        <p className="font-medium">
                          {locations?.find(l => l.id === transferToLocation)?.name}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setTransferConfirming(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={() => {
                      if (transferTo) {
                        transferMutation.mutate({
                          to_user_id: transferTo,
                          component_id: transferModal.component.id,
                          quantity: transferAmount,
                          to_location_id: transferToLocation,
                        })
                      }
                    }}
                    disabled={transferMutation.isPending}
                    className="btn bg-green-600 hover:bg-green-700 flex-1"
                  >
                    {transferMutation.isPending ? 'Wird transferiert...' : 'Bestätigen'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Komponente hinzufügen Modal */}
      {addModal && (
        <ComponentSelectModal
          components={components || []}
          myInventory={myInventory || []}
          categories={categories || []}
          manufacturers={manufacturers || []}
          locations={locations || []}
          onSelect={(componentId, quantity, locationId) => {
            addMutation.mutate({ componentId, quantity, locationId })
          }}
          onClose={() => {
            setAddModal(false)
          }}
          isPending={addMutation.isPending}
        />
      )}

      {/* Bulk Move Modal */}
      {bulkMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ArrowRightLeft size={24} className="text-krt-orange" />
              Alle Items verschieben
            </h2>
            <p className="text-gray-400 mb-4">
              Verschiebt alle deine Items von einem Standort zu einem anderen.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Von Standort</label>
                <select
                  value={bulkFromLocation === null ? 'null' : bulkFromLocation}
                  onChange={(e) => setBulkFromLocation(e.target.value === 'null' ? null : Number(e.target.value))}
                  className="input"
                >
                  <option value="null">Ohne Standort</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <ArrowRight size={24} className="text-gray-400" />
              </div>

              <div>
                <label className="label">Zu Standort</label>
                <select
                  value={bulkToLocation === null ? 'null' : bulkToLocation}
                  onChange={(e) => setBulkToLocation(e.target.value === 'null' ? null : Number(e.target.value))}
                  className="input"
                >
                  <option value="null">Ohne Standort</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setBulkMoveModal(false)
                    setBulkFromLocation(null)
                    setBulkToLocation(null)
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    bulkMoveMutation.mutate({
                      from_location_id: bulkFromLocation,
                      to_location_id: bulkToLocation,
                    })
                  }}
                  disabled={bulkMoveMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {bulkMoveMutation.isPending ? 'Wird verschoben...' : 'Verschieben'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patch-Reset Modal */}
      {patchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Package size={24} className="text-amber-500" />
              Patch-Reset
            </h2>
            <p className="text-gray-400 mb-4">
              Nach einem Patch: Wähle aus, welche Items du noch hast. Nicht ausgewählte werden aus dem Inventar entfernt.
              Alle behaltenen Items werden an deine neue Homelocation verschoben.
            </p>

            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Neue Homelocation */}
              <div>
                <label className="label">Neue Homelocation</label>
                <select
                  value={patchNewLocation ?? ''}
                  onChange={(e) => setPatchNewLocation(e.target.value ? Number(e.target.value) : null)}
                  className="input"
                >
                  <option value="">Location wählen...</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick-Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (myInventory) {
                      setPatchKeptItems(new Set(myInventory.map(i => i.id)))
                    }
                  }}
                  className="btn btn-secondary text-sm"
                >
                  Alle auswählen
                </button>
                <button
                  onClick={() => setPatchKeptItems(new Set())}
                  className="btn btn-secondary text-sm"
                >
                  Alle abwählen
                </button>
                <span className="ml-auto text-sm text-gray-400 self-center">
                  {patchKeptItems.size} von {myInventory?.length || 0} ausgewählt
                </span>
              </div>

              {/* Items Liste mit Checkboxen */}
              <div className="flex-1 overflow-y-auto border border-gray-700 rounded-lg">
                {myInventory && myInventory.length > 0 ? (
                  <div className="divide-y divide-gray-700">
                    {/* Nach Standort gruppieren */}
                    {(() => {
                      const byLocation: Record<string, typeof myInventory> = {}
                      myInventory.forEach(item => {
                        const locName = item.location?.name || 'Ohne Standort'
                        if (!byLocation[locName]) byLocation[locName] = []
                        byLocation[locName].push(item)
                      })
                      return Object.entries(byLocation).map(([locName, items]) => (
                        <div key={locName}>
                          <div className="bg-gray-800/50 px-3 py-2 sticky top-0 flex items-center justify-between">
                            <span className="font-medium flex items-center gap-2">
                              <MapPin size={14} className="text-gray-400" />
                              {locName}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const itemIds = items.map(i => i.id)
                                  const allSelected = itemIds.every(id => patchKeptItems.has(id))
                                  const newSet = new Set(patchKeptItems)
                                  if (allSelected) {
                                    itemIds.forEach(id => newSet.delete(id))
                                  } else {
                                    itemIds.forEach(id => newSet.add(id))
                                  }
                                  setPatchKeptItems(newSet)
                                }}
                                className="text-xs text-krt-orange hover:text-krt-orange/80"
                              >
                                {items.every(i => patchKeptItems.has(i.id)) ? 'Alle abwählen' : 'Alle auswählen'}
                              </button>
                              <span className="text-xs text-gray-500">
                                {items.filter(i => patchKeptItems.has(i.id)).length}/{items.length}
                              </span>
                            </div>
                          </div>
                          {items.map(item => (
                            <label
                              key={item.id}
                              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/30 transition-colors ${
                                patchKeptItems.has(item.id) ? 'bg-green-900/20' : 'bg-red-900/10'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={patchKeptItems.has(item.id)}
                                onChange={(e) => {
                                  const newSet = new Set(patchKeptItems)
                                  if (e.target.checked) {
                                    newSet.add(item.id)
                                  } else {
                                    newSet.delete(item.id)
                                  }
                                  setPatchKeptItems(newSet)
                                }}
                                className="rounded"
                              />
                              <div className="flex-1">
                                <p className={`font-medium ${patchKeptItems.has(item.id) ? 'text-white' : 'text-gray-500 line-through'}`}>
                                  {item.component.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {item.component.category}
                                  {item.component.manufacturer && ` • ${item.component.manufacturer}`}
                                </p>
                              </div>
                              <span className={`font-bold ${patchKeptItems.has(item.id) ? 'text-krt-orange' : 'text-gray-600'}`}>
                                {item.quantity}x
                              </span>
                            </label>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-400">
                    Keine Items im Inventar.
                  </div>
                )}
              </div>

              {/* Zusammenfassung */}
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">
                    Behalten: {patchKeptItems.size} Items ({myInventory?.filter(i => patchKeptItems.has(i.id)).reduce((s, i) => s + i.quantity, 0) || 0} Stück)
                  </span>
                  <span className="text-red-400">
                    Entfernen: {(myInventory?.length || 0) - patchKeptItems.size} Items ({myInventory?.filter(i => !patchKeptItems.has(i.id)).reduce((s, i) => s + i.quantity, 0) || 0} Stück)
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setPatchModal(false)
                    setPatchNewLocation(null)
                    setPatchKeptItems(new Set())
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (patchNewLocation) {
                      patchResetMutation.mutate({
                        new_location_id: patchNewLocation,
                        kept_item_ids: Array.from(patchKeptItems),
                      })
                    }
                  }}
                  disabled={!patchNewLocation || patchResetMutation.isPending}
                  className="btn bg-amber-600 hover:bg-amber-500 flex-1"
                >
                  {patchResetMutation.isPending ? 'Wird verarbeitet...' : 'Patch-Reset durchführen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Eigene Komponente für das Komponentenauswahl-Modal mit Filter
interface ComponentSelectModalProps {
  components: Component[]
  myInventory: InventoryItem[]
  categories: string[]
  manufacturers: string[]
  locations: Location[]
  onSelect: (componentId: number, quantity: number, locationId: number | null) => void
  onClose: () => void
  isPending: boolean
}

function ComponentSelectModal({
  components,
  myInventory,
  categories,
  manufacturers,
  locations,
  onSelect,
  onClose,
  isPending,
}: ComponentSelectModalProps) {
  const [modalSearch, setModalSearch] = useState('')
  const [modalCategory, setModalCategory] = useState('')
  const [modalManufacturer, setModalManufacturer] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [locationId, setLocationId] = useState<number | null>(null)

  // Komponenten filtern
  const filteredComponents = components.filter(c => {
    const matchesSearch = !modalSearch ||
      c.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (c.manufacturer?.toLowerCase().includes(modalSearch.toLowerCase()))
    const matchesCategory = !modalCategory || c.category === modalCategory
    const matchesManufacturer = !modalManufacturer || c.manufacturer === modalManufacturer
    return matchesSearch && matchesCategory && matchesManufacturer
  }).slice(0, 100) // Limit auf 100 Ergebnisse

  // Prüfen ob Komponente bereits im Inventar
  const getInventoryQuantity = (componentId: number) => {
    const item = myInventory.find(i => i.component.id === componentId)
    return item?.quantity || 0
  }

  const selectedComponent = components.find(c => c.id === selectedId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <h2 className="text-xl font-bold mb-4">Komponente hinzufügen</h2>

        {/* Filter-Bereich */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              placeholder="Komponente suchen..."
              className="input pl-10"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <select
              value={modalCategory}
              onChange={(e) => setModalCategory(e.target.value)}
              className="input flex-1"
            >
              <option value="">Alle Kategorien</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={modalManufacturer}
              onChange={(e) => setModalManufacturer(e.target.value)}
              className="input flex-1"
            >
              <option value="">Alle Hersteller</option>
              {manufacturers.sort().map((manu) => (
                <option key={manu} value={manu}>{manu}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Komponenten-Liste */}
        <div className="flex-1 overflow-y-auto mb-4 border border-gray-700 rounded-lg">
          {filteredComponents.length > 0 ? (
            <div className="divide-y divide-gray-700">
              {filteredComponents.map((comp) => {
                const inInventory = getInventoryQuantity(comp.id)
                return (
                  <button
                    key={comp.id}
                    onClick={() => setSelectedId(comp.id)}
                    className={`w-full p-3 text-left hover:bg-gray-700/50 transition-colors ${
                      selectedId === comp.id ? 'bg-krt-orange/20 border-l-2 border-krt-orange' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{comp.name}</p>
                        <p className="text-sm text-gray-400">
                          {[comp.category, comp.manufacturer, comp.size && `Size ${comp.size}`, comp.grade && `Grade ${comp.grade}`]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>
                      {inInventory > 0 && (
                        <span className="text-xs bg-gray-600 px-2 py-1 rounded">
                          {inInventory}x im Lager
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400">
              {modalSearch || modalCategory || modalManufacturer
                ? 'Keine Komponenten gefunden.'
                : 'Gib einen Suchbegriff ein oder wähle eine Kategorie.'}
            </div>
          )}
          {filteredComponents.length === 100 && (
            <p className="p-2 text-center text-sm text-gray-500">
              Zeige erste 100 Ergebnisse. Verfeinere deine Suche für mehr.
            </p>
          )}
        </div>

        {/* Ausgewählte Komponente */}
        {selectedComponent && (
          <div className="p-3 bg-gray-800/50 rounded-lg mb-4">
            <p className="text-sm text-gray-400 mb-1">Ausgewählt:</p>
            <p className="font-bold text-krt-orange">{selectedComponent.name}</p>
          </div>
        )}

        {/* Menge und Standort */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Menge</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Standort (optional)</label>
            <select
              value={locationId ?? ''}
              onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
              className="input"
            >
              <option value="">Kein Standort</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Abbrechen
          </button>
          <button
            onClick={() => {
              if (selectedId) {
                onSelect(selectedId, quantity, locationId)
                onClose()
              }
            }}
            disabled={!selectedId || isPending}
            className="btn btn-primary flex-1"
          >
            {isPending ? 'Wird hinzugefügt...' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
