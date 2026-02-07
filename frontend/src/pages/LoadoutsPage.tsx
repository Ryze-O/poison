import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Search, ChevronDown, ChevronRight, ExternalLink, Check, X, Send, Trash2, Edit2, Save, Loader, Ship as ShipIcon, Calendar, Download } from 'lucide-react'
import ComponentSearchModal from '../components/ComponentSearchModal'
import type { MetaLoadout, MetaLoadoutList, ShipWithHardpoints, ShipSearchResult, LoadoutCheck, Component, UserLoadout, ErkulImportResponse } from '../api/types'

// Hardpoint-Typ Labels und Farben
const hardpointTypeLabels: Record<string, string> = {
  weapon_gun: 'Waffen',
  turret: 'Türme',
  missile_launcher: 'Raketen',
  shield: 'Schilde',
  power_plant: 'Kraftwerk',
  cooler: 'Kühler',
  quantum_drive: 'Quantum Drive',
}

const hardpointTypeColors: Record<string, string> = {
  weapon_gun: 'bg-red-500/20 text-red-400 border-red-500/40',
  turret: 'bg-pink-500/20 text-pink-400 border-pink-500/40',
  missile_launcher: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
  shield: 'bg-green-500/20 text-green-400 border-green-500/40',
  power_plant: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  cooler: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  quantum_drive: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
}

// Sortier-Reihenfolge für Hardpoint-Typen
const hardpointOrder = ['weapon_gun', 'turret', 'missile_launcher', 'shield', 'power_plant', 'cooler', 'quantum_drive']

export default function LoadoutsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'
  const isOfficer = user?.role === 'officer' || isAdmin

  // State
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<number | null>(null)
  const [expandedLoadouts, setExpandedLoadouts] = useState<Set<number>>(new Set())
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingLoadoutId, setEditingLoadoutId] = useState<number | null>(null)

  // Create Form State
  const [shipSearch, setShipSearch] = useState('')
  const [selectedShip, setSelectedShip] = useState<ShipSearchResult | null>(null)
  const [newLoadoutName, setNewLoadoutName] = useState('')
  const [newLoadoutDesc, setNewLoadoutDesc] = useState('')
  const [newErkulLink, setNewErkulLink] = useState('')
  const [newVersionDate, setNewVersionDate] = useState('')

  // Component search modal
  const [componentModal, setComponentModal] = useState<{
    loadoutId: number
    hardpointType: string
    slotIndex: number
    size: number
  } | null>(null)

  // Check state
  const [checkLoadoutId, setCheckLoadoutId] = useState<number | null>(null)

  // Edit loadout state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editErkul, setEditErkul] = useState('')
  const [editVersionDate, setEditVersionDate] = useState('')

  // Erkul Import state
  const [showErkulImport, setShowErkulImport] = useState<number | null>(null) // loadout_id
  const [erkulUrl, setErkulUrl] = useState('')
  const [erkulResult, setErkulResult] = useState<ErkulImportResponse | null>(null)

  // UserLoadout (Meine gefitteten Schiffe) state
  const [showAddMyShip, setShowAddMyShip] = useState(false)
  const [myShipLoadoutId, setMyShipLoadoutId] = useState<number | null>(null)
  const [myShipNickname, setMyShipNickname] = useState('')
  const [myShipReady, setMyShipReady] = useState(false)
  const [myShipNotes, setMyShipNotes] = useState('')
  const [editingMyShipId, setEditingMyShipId] = useState<number | null>(null)

  // Queries
  const { data: loadouts, isLoading: loadoutsLoading } = useQuery<MetaLoadoutList[]>({
    queryKey: ['loadouts'],
    queryFn: async () => (await apiClient.get('/api/loadouts/')).data,
  })

  const { data: selectedLoadout } = useQuery<MetaLoadout>({
    queryKey: ['loadout', selectedLoadoutId],
    queryFn: async () => (await apiClient.get(`/api/loadouts/${selectedLoadoutId}`)).data,
    enabled: !!selectedLoadoutId,
  })

  const { data: shipDetail } = useQuery<ShipWithHardpoints>({
    queryKey: ['ship', selectedLoadout?.ship?.id],
    queryFn: async () => (await apiClient.get(`/api/loadouts/ships/${selectedLoadout!.ship.id}`)).data,
    enabled: !!selectedLoadout?.ship?.id,
  })

  const { data: shipSearchResults } = useQuery<ShipSearchResult[]>({
    queryKey: ['ship-search', shipSearch],
    queryFn: async () => (await apiClient.get(`/api/loadouts/ships/search?q=${encodeURIComponent(shipSearch)}`)).data,
    enabled: shipSearch.length >= 2,
  })

  const { data: loadoutCheck } = useQuery<LoadoutCheck>({
    queryKey: ['loadout-check', checkLoadoutId],
    queryFn: async () => (await apiClient.get(`/api/loadouts/${checkLoadoutId}/check`)).data,
    enabled: !!checkLoadoutId,
  })

  // UserLoadout (Meine gefitteten Schiffe)
  const { data: myShips } = useQuery<UserLoadout[]>({
    queryKey: ['my-ships'],
    queryFn: async () => (await apiClient.get('/api/loadouts/my-ships')).data,
    enabled: !!user && ['member', 'officer', 'admin'].includes(user.role),
  })

  // Mutations
  const importShipMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await apiClient.post(`/api/loadouts/ships/import-by-slug?slug=${encodeURIComponent(slug)}`)
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ship-search'] }),
  })

  const createLoadoutMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiClient.post('/api/loadouts/', data)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['loadouts'] })
      setSelectedLoadoutId(data.id)
      setShowCreateForm(false)
      resetCreateForm()
    },
  })

  const updateLoadoutMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiClient.patch(`/api/loadouts/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadouts'] })
      queryClient.invalidateQueries({ queryKey: ['loadout', editingLoadoutId] })
      setEditingLoadoutId(null)
    },
  })

  const deleteLoadoutMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/api/loadouts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadouts'] })
      if (selectedLoadoutId) setSelectedLoadoutId(null)
    },
  })

  const setItemsMutation = useMutation({
    mutationFn: async ({ loadoutId, items }: { loadoutId: number; items: Array<{ hardpoint_type: string; slot_index: number; component_id: number; hardpoint_id?: number }> }) => {
      const res = await apiClient.post(`/api/loadouts/${loadoutId}/items`, { items })
      return res.data
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['loadout', vars.loadoutId] })
    },
  })

  const requestMissingMutation = useMutation({
    mutationFn: async (loadoutId: number) => {
      const res = await apiClient.post(`/api/loadouts/${loadoutId}/request-missing`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadout-check', checkLoadoutId] })
    },
  })

  const importHardpointsMutation = useMutation({
    mutationFn: async (shipId: number) => {
      const res = await apiClient.post(`/api/loadouts/ships/${shipId}/import-hardpoints`)
      return res.data
    },
    onSuccess: (_, shipId) => {
      queryClient.invalidateQueries({ queryKey: ['ship', shipId] })
      if (selectedLoadoutId) queryClient.invalidateQueries({ queryKey: ['loadout', selectedLoadoutId] })
    },
  })

  const erkulImportMutation = useMutation({
    mutationFn: async ({ loadoutId, erkulUrl }: { loadoutId: number; erkulUrl: string }) => {
      const res = await apiClient.post(`/api/loadouts/${loadoutId}/import-erkul`, { erkul_url: erkulUrl })
      return res.data as ErkulImportResponse
    },
    onSuccess: (data, vars) => {
      setErkulResult(data)
      setErkulUrl('')
      queryClient.invalidateQueries({ queryKey: ['loadout', vars.loadoutId] })
      queryClient.invalidateQueries({ queryKey: ['loadouts'] })
    },
  })

  // UserLoadout Mutations
  const createMyShipMutation = useMutation({
    mutationFn: async (data: { loadout_id: number; ship_nickname?: string; is_ready: boolean; notes?: string }) => {
      const res = await apiClient.post('/api/loadouts/my-ships', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ships'] })
      setShowAddMyShip(false)
      setMyShipLoadoutId(null)
      setMyShipNickname('')
      setMyShipReady(false)
      setMyShipNotes('')
    },
  })

  const updateMyShipMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { ship_nickname?: string; is_ready?: boolean; notes?: string } }) => {
      const res = await apiClient.patch(`/api/loadouts/my-ships/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ships'] })
      setEditingMyShipId(null)
    },
  })

  const deleteMyShipMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/api/loadouts/my-ships/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-ships'] }),
  })

  // Helper
  const resetCreateForm = () => {
    setShipSearch('')
    setSelectedShip(null)
    setNewLoadoutName('')
    setNewLoadoutDesc('')
    setNewErkulLink('')
    setNewVersionDate('')
  }

  // Gruppiere Loadout-Items nach Hardpoint-Typ
  const groupedItems = useMemo(() => {
    if (!selectedLoadout) return {}
    const groups: Record<string, typeof selectedLoadout.items> = {}
    selectedLoadout.items.forEach(item => {
      if (!groups[item.hardpoint_type]) groups[item.hardpoint_type] = []
      groups[item.hardpoint_type].push(item)
    })
    return groups
  }, [selectedLoadout])

  // Gruppiere Ship-Hardpoints nach Typ
  const groupedHardpoints = useMemo(() => {
    if (!shipDetail) return {}
    const groups: Record<string, typeof shipDetail.hardpoints> = {}
    shipDetail.hardpoints.forEach(hp => {
      if (!groups[hp.hardpoint_type]) groups[hp.hardpoint_type] = []
      groups[hp.hardpoint_type].push(hp)
    })
    return groups
  }, [shipDetail])

  // Loadouts nach Schiff gruppiert
  const loadoutsByShip = useMemo(() => {
    if (!loadouts) return {}
    const groups: Record<string, MetaLoadoutList[]> = {}
    loadouts.forEach(l => {
      const key = l.ship.name
      if (!groups[key]) groups[key] = []
      groups[key].push(l)
    })
    return groups
  }, [loadouts])

  // Handler: Component zu Loadout-Slot zuweisen
  const handleAssignComponent = (component: Component) => {
    if (!componentModal || !selectedLoadout) return

    const existingItems = selectedLoadout.items
      .filter(i => !(i.hardpoint_type === componentModal.hardpointType && i.slot_index === componentModal.slotIndex))
      .map(i => ({
        hardpoint_type: i.hardpoint_type,
        slot_index: i.slot_index,
        component_id: i.component.id,
        hardpoint_id: i.hardpoint_id ?? undefined,
      }))

    const hardpoint = shipDetail?.hardpoints.find(
      hp => hp.hardpoint_type === componentModal.hardpointType && hp.slot_index === componentModal.slotIndex
    )

    existingItems.push({
      hardpoint_type: componentModal.hardpointType,
      slot_index: componentModal.slotIndex,
      component_id: component.id,
      hardpoint_id: hardpoint?.id ?? undefined,
    })

    setItemsMutation.mutate({ loadoutId: selectedLoadout.id, items: existingItems })
    setComponentModal(null)
  }

  // Handler: Slot-Item entfernen
  const handleRemoveItem = (hardpointType: string, slotIndex: number) => {
    if (!selectedLoadout) return
    const remainingItems = selectedLoadout.items
      .filter(i => !(i.hardpoint_type === hardpointType && i.slot_index === slotIndex))
      .map(i => ({
        hardpoint_type: i.hardpoint_type,
        slot_index: i.slot_index,
        component_id: i.component.id,
        hardpoint_id: i.hardpoint_id ?? undefined,
      }))
    setItemsMutation.mutate({ loadoutId: selectedLoadout.id, items: remainingItems })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meta-Loadouts</h1>
        {isOfficer && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Neues Loadout
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4">Neues Meta-Loadout erstellen</h2>

          {/* Schiff-Suche */}
          {!selectedShip ? (
            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={shipSearch}
                  onChange={(e) => setShipSearch(e.target.value)}
                  placeholder="Schiff suchen (z.B. Gladius, Polaris...)"
                  className="input pl-10"
                />
              </div>

              {shipSearchResults && shipSearchResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {shipSearchResults.map((ship, idx) => (
                    <button
                      key={`${ship.slug}-${idx}`}
                      onClick={async () => {
                        if (ship.source === 'fleetyards' && ship.slug) {
                          // Import from FleetYards
                          const imported = await importShipMutation.mutateAsync(ship.slug)
                          setSelectedShip({ ...ship, id: imported.id, source: 'local' })
                        } else {
                          setSelectedShip(ship)
                        }
                      }}
                      disabled={importShipMutation.isPending}
                      className="w-full text-left p-3 rounded-lg hover:bg-gray-700/50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{ship.name}</p>
                        <p className="text-xs text-gray-500">
                          {ship.manufacturer}
                          {ship.source === 'fleetyards' && ' (FleetYards - wird importiert)'}
                        </p>
                      </div>
                      {ship.source === 'fleetyards' && (
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">Import</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {importShipMutation.isPending && (
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <Loader size={14} className="animate-spin" />
                  Importiere Schiff von FleetYards...
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                <div>
                  <p className="font-medium">{selectedShip.name}</p>
                  <p className="text-xs text-gray-500">{selectedShip.manufacturer}</p>
                </div>
                <button
                  onClick={() => setSelectedShip(null)}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Ändern
                </button>
              </div>

              <div>
                <label className="label">Loadout-Name *</label>
                <input
                  type="text"
                  value={newLoadoutName}
                  onChange={(e) => setNewLoadoutName(e.target.value)}
                  placeholder="z.B. Viper PvP Meta"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Beschreibung</label>
                <textarea
                  value={newLoadoutDesc}
                  onChange={(e) => setNewLoadoutDesc(e.target.value)}
                  placeholder="Optionale Beschreibung..."
                  className="input"
                  rows={2}
                />
              </div>

              <div>
                <label className="label">Erkul-Link</label>
                <input
                  type="text"
                  value={newErkulLink}
                  onChange={(e) => setNewErkulLink(e.target.value)}
                  placeholder="https://www.erkul.games/loadout/..."
                  className="input"
                />
              </div>

              <div>
                <label className="label">Version-Datum</label>
                <input
                  type="date"
                  value={newVersionDate}
                  onChange={(e) => setNewVersionDate(e.target.value)}
                  className="input"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowCreateForm(false); resetCreateForm() }} className="btn btn-secondary">
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (!selectedShip?.id || !newLoadoutName.trim()) return
                    createLoadoutMutation.mutate({
                      ship_id: selectedShip.id,
                      name: newLoadoutName.trim(),
                      description: newLoadoutDesc.trim() || undefined,
                      erkul_link: newErkulLink.trim() || undefined,
                      version_date: newVersionDate || undefined,
                    } as Record<string, unknown>)
                  }}
                  disabled={!selectedShip?.id || !newLoadoutName.trim() || createLoadoutMutation.isPending}
                  className="btn btn-primary"
                >
                  Erstellen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meine gefitteten Schiffe */}
      {user && ['member', 'officer', 'admin'].includes(user.role) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShipIcon size={18} className="text-krt-orange" />
              Meine gefitteten Schiffe
            </h2>
            <button
              onClick={() => setShowAddMyShip(!showAddMyShip)}
              className="btn btn-secondary text-sm flex items-center gap-1"
            >
              <Plus size={14} />
              Schiff hinzufügen
            </button>
          </div>

          {/* Add Form */}
          {showAddMyShip && (
            <div className="bg-gray-800/30 rounded-lg p-4 mb-4 space-y-3">
              <div>
                <label className="label">Meta-Loadout auswählen *</label>
                <select
                  value={myShipLoadoutId ?? ''}
                  onChange={(e) => setMyShipLoadoutId(e.target.value ? Number(e.target.value) : null)}
                  className="input"
                >
                  <option value="">-- Loadout wählen --</option>
                  {loadouts?.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.ship.name} — {l.name}
                      {l.version_date && ` (${new Date(l.version_date).toLocaleDateString('de-DE')})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Spitzname (optional)</label>
                <input
                  type="text"
                  value={myShipNickname}
                  onChange={(e) => setMyShipNickname(e.target.value)}
                  placeholder='z.B. "Viper 1", "Shadow"'
                  className="input"
                />
              </div>
              <div>
                <label className="label">Notizen (optional)</label>
                <input
                  type="text"
                  value={myShipNotes}
                  onChange={(e) => setMyShipNotes(e.target.value)}
                  placeholder="z.B. am Einsatzort bereit"
                  className="input"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={myShipReady}
                  onChange={(e) => setMyShipReady(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600"
                />
                <span className="text-sm">Vollständig gefittet (einsatzbereit)</span>
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddMyShip(false)} className="btn btn-secondary text-sm">Abbrechen</button>
                <button
                  onClick={() => {
                    if (!myShipLoadoutId) return
                    createMyShipMutation.mutate({
                      loadout_id: myShipLoadoutId,
                      ship_nickname: myShipNickname.trim() || undefined,
                      is_ready: myShipReady,
                      notes: myShipNotes.trim() || undefined,
                    })
                  }}
                  disabled={!myShipLoadoutId || createMyShipMutation.isPending}
                  className="btn btn-primary text-sm"
                >
                  Speichern
                </button>
              </div>
            </div>
          )}

          {/* My Ships Grid */}
          {!myShips || myShips.length === 0 ? (
            <p className="text-gray-500 text-sm">Noch keine Schiffe hinterlegt. Füge dein erstes gefittetes Schiff hinzu.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {myShips.map(ms => {
                const isEditingThis = editingMyShipId === ms.id
                return (
                  <div
                    key={ms.id}
                    className={`rounded-lg border p-3 ${
                      ms.is_ready
                        ? 'border-green-500/40 bg-green-500/5'
                        : 'border-yellow-500/40 bg-yellow-500/5'
                    }`}
                  >
                    {isEditingThis ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          defaultValue={ms.ship_nickname || ''}
                          id={`edit-nickname-${ms.id}`}
                          placeholder="Spitzname"
                          className="input text-sm"
                        />
                        <input
                          type="text"
                          defaultValue={ms.notes || ''}
                          id={`edit-notes-${ms.id}`}
                          placeholder="Notizen"
                          className="input text-sm"
                        />
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            defaultChecked={ms.is_ready}
                            id={`edit-ready-${ms.id}`}
                            className="w-4 h-4 rounded border-gray-600"
                          />
                          <span className="text-xs">Einsatzbereit</span>
                        </label>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingMyShipId(null)} className="btn btn-secondary text-xs flex-1">Abbrechen</button>
                          <button
                            onClick={() => {
                              const nickname = (document.getElementById(`edit-nickname-${ms.id}`) as HTMLInputElement).value
                              const notes = (document.getElementById(`edit-notes-${ms.id}`) as HTMLInputElement).value
                              const ready = (document.getElementById(`edit-ready-${ms.id}`) as HTMLInputElement).checked
                              updateMyShipMutation.mutate({
                                id: ms.id,
                                data: {
                                  ship_nickname: nickname.trim() || undefined,
                                  notes: notes.trim() || undefined,
                                  is_ready: ready,
                                },
                              })
                            }}
                            className="btn btn-primary text-xs flex-1"
                          >
                            Speichern
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-bold text-sm">{ms.ship.name}</p>
                          {ms.is_ready
                            ? <Check size={14} className="text-green-400 flex-shrink-0" />
                            : <X size={14} className="text-yellow-400 flex-shrink-0" />
                          }
                        </div>
                        {ms.ship_nickname && (
                          <p className="text-xs text-gray-400 italic">"{ms.ship_nickname}"</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">{ms.loadout.name}</p>
                        {ms.loadout.version_date && (
                          <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5">
                            <Calendar size={9} />
                            {new Date(ms.loadout.version_date).toLocaleDateString('de-DE')}
                          </p>
                        )}
                        {/* Komponenten-Zusammenfassung */}
                        {ms.loadout.items && ms.loadout.items.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {hardpointOrder
                              .filter(type => ms.loadout.items.some(i => i.hardpoint_type === type))
                              .map(type => {
                                const items = ms.loadout.items.filter(i => i.hardpoint_type === type)
                                // Komponenten zählen und gruppieren
                                const counts = new Map<string, number>()
                                items.forEach(i => {
                                  const name = i.component.name
                                  counts.set(name, (counts.get(name) || 0) + 1)
                                })
                                const parts = Array.from(counts.entries()).map(([name, count]) =>
                                  count > 1 ? `${count}x ${name}` : name
                                )
                                return (
                                  <p key={type} className="text-[10px] text-gray-500 leading-tight">
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                                      hardpointTypeColors[type]?.includes('red') ? 'bg-red-400' :
                                      hardpointTypeColors[type]?.includes('pink') ? 'bg-pink-400' :
                                      hardpointTypeColors[type]?.includes('rose') ? 'bg-rose-400' :
                                      hardpointTypeColors[type]?.includes('green') ? 'bg-green-400' :
                                      hardpointTypeColors[type]?.includes('yellow') ? 'bg-yellow-400' :
                                      hardpointTypeColors[type]?.includes('sky') ? 'bg-sky-400' :
                                      hardpointTypeColors[type]?.includes('purple') ? 'bg-purple-400' :
                                      'bg-gray-400'
                                    }`} />
                                    <span className="text-gray-600">{hardpointTypeLabels[type] || type}:</span>{' '}
                                    {parts.join(', ')}
                                  </p>
                                )
                              })}
                          </div>
                        )}
                        {ms.notes && (
                          <p className="text-[10px] text-gray-500 mt-1">{ms.notes}</p>
                        )}
                        <p className={`text-xs mt-1 ${ms.is_ready ? 'text-green-400' : 'text-yellow-400'}`}>
                          {ms.is_ready ? 'Einsatzbereit' : 'Nicht komplett'}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => setEditingMyShipId(ms.id)}
                            className="text-[10px] text-gray-400 hover:text-white"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`"${ms.ship.name}" entfernen?`)) {
                                deleteMyShipMutation.mutate(ms.id)
                              }
                            }}
                            className="text-[10px] text-gray-400 hover:text-red-400"
                          >
                            Entfernen
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Loadout-Liste */}
      {loadoutsLoading ? (
        <div className="card text-gray-400">Lade Loadouts...</div>
      ) : !loadouts || loadouts.length === 0 ? (
        <div className="card text-gray-400">
          Noch keine Meta-Loadouts vorhanden.
          {isOfficer && ' Erstelle das erste Loadout über den Button oben.'}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(loadoutsByShip)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([shipName, shipLoadouts]) => {
              const isExpanded = shipLoadouts.some(l => expandedLoadouts.has(l.id))
              return (
                <div key={shipName} className="card p-0 overflow-hidden">
                  {/* Ship Header */}
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedLoadouts)
                      const allExpanded = shipLoadouts.every(l => newExpanded.has(l.id))
                      shipLoadouts.forEach(l => {
                        if (allExpanded) newExpanded.delete(l.id)
                        else newExpanded.add(l.id)
                      })
                      setExpandedLoadouts(newExpanded)
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-800/70 hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={18} className="text-krt-orange" /> : <ChevronRight size={18} className="text-gray-400" />}
                      <div>
                        <p className="font-bold">{shipName}</p>
                        <p className="text-xs text-gray-500">{shipLoadouts[0].ship.manufacturer} · {shipLoadouts.length} Loadout{shipLoadouts.length > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {shipLoadouts[0].ship.image_url && (
                      <img
                        src={shipLoadouts[0].ship.image_url}
                        alt={shipName}
                        className="h-12 w-auto rounded opacity-60"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                  </button>

                  {/* Loadouts for this ship */}
                  {shipLoadouts.map(loadout => {
                    if (!expandedLoadouts.has(loadout.id)) return null
                    const isSelected = selectedLoadoutId === loadout.id
                    const isEditing = editingLoadoutId === loadout.id

                    return (
                      <div key={loadout.id} className="border-t border-gray-700/50">
                        {/* Loadout Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/30">
                          <button
                            onClick={() => {
                              setSelectedLoadoutId(isSelected ? null : loadout.id)
                              setCheckLoadoutId(null)
                            }}
                            className="flex items-center gap-2 text-left flex-1"
                          >
                            <span className="font-medium text-krt-orange">{loadout.name}</span>
                            {loadout.description && (
                              <span className="text-xs text-gray-500">— {loadout.description}</span>
                            )}
                            {loadout.version_date && (
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Calendar size={10} />
                                {new Date(loadout.version_date).toLocaleDateString('de-DE')}
                              </span>
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            {loadout.erkul_link && (
                              <a
                                href={loadout.erkul_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-gray-400 hover:text-krt-orange"
                                title="Erkul öffnen"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            {isOfficer && (
                              <button
                                onClick={() => {
                                  setEditingLoadoutId(isEditing ? null : loadout.id)
                                  if (!isEditing) {
                                    setEditName(loadout.name)
                                    setEditDesc(loadout.description || '')
                                    setEditErkul(loadout.erkul_link || '')
                                    setEditVersionDate(loadout.version_date || '')
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                                title="Bearbeiten"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  if (confirm(`Loadout "${loadout.name}" wirklich löschen?`)) {
                                    deleteLoadoutMutation.mutate(loadout.id)
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-red-400"
                                title="Löschen"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Edit Form */}
                        {isEditing && (
                          <div className="px-4 py-3 bg-gray-800/20 border-t border-gray-700/30 space-y-3">
                            <div>
                              <label className="label">Name</label>
                              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" />
                            </div>
                            <div>
                              <label className="label">Beschreibung</label>
                              <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="input" />
                            </div>
                            <div>
                              <label className="label">Erkul-Link</label>
                              <input value={editErkul} onChange={(e) => setEditErkul(e.target.value)} className="input" />
                            </div>
                            <div>
                              <label className="label">Version-Datum</label>
                              <input type="date" value={editVersionDate} onChange={(e) => setEditVersionDate(e.target.value)} className="input" />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingLoadoutId(null)} className="btn btn-secondary text-sm">Abbrechen</button>
                              <button
                                onClick={() => {
                                  updateLoadoutMutation.mutate({
                                    id: loadout.id,
                                    data: {
                                      name: editName.trim(),
                                      description: editDesc.trim() || null,
                                      erkul_link: editErkul.trim() || null,
                                      version_date: editVersionDate || null,
                                    },
                                  })
                                }}
                                className="btn btn-primary text-sm flex items-center gap-1"
                              >
                                <Save size={14} /> Speichern
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Loadout Detail (Slots) */}
                        {isSelected && selectedLoadout && (
                          <div className="px-4 py-4 space-y-4">
                            {/* Schiffsbild */}
                            {selectedLoadout.ship.image_url && (
                              <div className="flex justify-center">
                                <img
                                  src={selectedLoadout.ship.image_url}
                                  alt={selectedLoadout.ship.name}
                                  className="max-h-48 w-auto rounded-lg opacity-80"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              </div>
                            )}

                            {/* Hardpoints importieren (wenn noch keine) */}
                            {shipDetail && shipDetail.hardpoints.length === 0 && isAdmin && (
                              <button
                                onClick={() => importHardpointsMutation.mutate(selectedLoadout.ship.id)}
                                disabled={importHardpointsMutation.isPending}
                                className="btn btn-secondary w-full"
                              >
                                {importHardpointsMutation.isPending ? 'Importiere...' : 'Hardpoints von FleetYards importieren'}
                              </button>
                            )}

                            {/* Erkul Import */}
                            {isOfficer && (
                              <div className="space-y-2">
                                {showErkulImport === selectedLoadout.id ? (
                                  <div className="bg-gray-800/40 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        value={erkulUrl}
                                        onChange={(e) => setErkulUrl(e.target.value)}
                                        placeholder="Erkul-Link oder Code (z.B. 4ZwmqCps)"
                                        className="input flex-1 text-sm"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && erkulUrl.trim()) {
                                            erkulImportMutation.mutate({ loadoutId: selectedLoadout.id, erkulUrl: erkulUrl.trim() })
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => erkulImportMutation.mutate({ loadoutId: selectedLoadout.id, erkulUrl: erkulUrl.trim() })}
                                        disabled={erkulImportMutation.isPending || !erkulUrl.trim()}
                                        className="btn btn-primary text-sm flex items-center gap-1"
                                      >
                                        {erkulImportMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                                        Importieren
                                      </button>
                                      <button
                                        onClick={() => { setShowErkulImport(null); setErkulResult(null); setErkulUrl('') }}
                                        className="btn btn-secondary text-sm"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>

                                    {erkulImportMutation.isError && (
                                      <p className="text-sm text-red-400">
                                        Fehler: {(erkulImportMutation.error as Error).message || 'Import fehlgeschlagen'}
                                      </p>
                                    )}

                                    {erkulResult && (
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-3 text-sm">
                                          <span className="text-krt-orange font-medium">{erkulResult.erkul_name}</span>
                                          <span className="text-green-400">{erkulResult.imported_count} importiert</span>
                                          {erkulResult.unmatched_count > 0 && (
                                            <span className="text-yellow-400">{erkulResult.unmatched_count} nicht gefunden</span>
                                          )}
                                        </div>
                                        {erkulResult.unmatched_items.length > 0 && (
                                          <div className="text-xs text-gray-400">
                                            <span className="text-yellow-400">Nicht zugeordnet: </span>
                                            {erkulResult.unmatched_items.join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setShowErkulImport(selectedLoadout.id); setErkulResult(null) }}
                                    className="btn btn-secondary text-sm flex items-center gap-1"
                                  >
                                    <Download size={14} />
                                    Von Erkul importieren
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Slot-Ansicht: Hardpoints des Schiffs oder nur Loadout-Items */}
                            {((shipDetail?.hardpoints?.length ?? 0) > 0 || (selectedLoadout.items?.length ?? 0) > 0) && (
                              <div className="space-y-4">
                                {hardpointOrder
                                  .filter(type => groupedHardpoints[type])
                                  .map(type => {
                                    const hardpoints = groupedHardpoints[type] || []
                                    const items = groupedItems[type] || []
                                    const color = hardpointTypeColors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/40'

                                    return (
                                      <div key={type}>
                                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                          <span className={`px-2 py-0.5 rounded border text-xs ${color}`}>
                                            {hardpointTypeLabels[type] || type}
                                          </span>
                                          <span className="text-xs text-gray-500">
                                            ({hardpoints.length} Slot{hardpoints.length > 1 ? 's' : ''})
                                          </span>
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                          {hardpoints.map(hp => {
                                            const assignedItem = items.find(i => i.slot_index === hp.slot_index)
                                            // Check-Daten für diesen Slot
                                            const checkItem = loadoutCheck?.items.find(
                                              ci => ci.hardpoint_type === type && ci.slot_index === hp.slot_index
                                            )

                                            return (
                                              <div
                                                key={`${type}-${hp.slot_index}`}
                                                className={`p-3 rounded-lg border ${
                                                  checkItem
                                                    ? checkItem.in_inventory > 0
                                                      ? 'border-green-500/40 bg-green-500/5'
                                                      : 'border-red-500/40 bg-red-500/5'
                                                    : assignedItem
                                                      ? 'border-gray-600 bg-gray-800/40'
                                                      : 'border-gray-700/30 bg-gray-800/20 border-dashed'
                                                }`}
                                              >
                                                <div className="flex items-center justify-between mb-1">
                                                  <span className="text-[10px] text-gray-500">
                                                    S{hp.size} · Slot {hp.slot_index + 1}
                                                  </span>
                                                  {checkItem && (
                                                    checkItem.in_inventory > 0
                                                      ? <Check size={14} className="text-green-400" />
                                                      : <X size={14} className="text-red-400" />
                                                  )}
                                                </div>

                                                {assignedItem ? (
                                                  <div>
                                                    <p className="font-medium text-sm truncate">{assignedItem.component.name}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">
                                                      {assignedItem.component.manufacturer}
                                                      {assignedItem.component.grade && ` · Grade ${assignedItem.component.grade}`}
                                                    </p>
                                                    {checkItem && checkItem.in_inventory === 0 && checkItem.available_from_pioneers > 0 && (
                                                      <p className="text-[10px] text-yellow-400 mt-0.5">
                                                        {checkItem.available_from_pioneers}x bei Pioneers
                                                      </p>
                                                    )}
                                                    {isOfficer && (
                                                      <div className="flex gap-1 mt-1">
                                                        <button
                                                          onClick={() => setComponentModal({
                                                            loadoutId: selectedLoadout.id,
                                                            hardpointType: type,
                                                            slotIndex: hp.slot_index,
                                                            size: hp.size,
                                                          })}
                                                          className="text-[10px] text-gray-400 hover:text-krt-orange"
                                                        >
                                                          Ändern
                                                        </button>
                                                        <button
                                                          onClick={() => handleRemoveItem(type, hp.slot_index)}
                                                          className="text-[10px] text-gray-400 hover:text-red-400"
                                                        >
                                                          Entfernen
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div>
                                                    <p className="text-xs text-gray-500 truncate">
                                                      {hp.default_component_name || 'Leer'}
                                                    </p>
                                                    {isOfficer && (
                                                      <button
                                                        onClick={() => setComponentModal({
                                                          loadoutId: selectedLoadout.id,
                                                          hardpointType: type,
                                                          slotIndex: hp.slot_index,
                                                          size: hp.size,
                                                        })}
                                                        className="text-[10px] text-krt-orange hover:underline mt-1"
                                                      >
                                                        + Zuweisen
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}

                                {/* Loadout-Items ohne Hardpoint (falls Schiff keine Hardpoints hatte beim Zuweisen) */}
                                {hardpointOrder
                                  .filter(type => !groupedHardpoints[type] && groupedItems[type])
                                  .map(type => (
                                    <div key={type}>
                                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded border text-xs ${hardpointTypeColors[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/40'}`}>
                                          {hardpointTypeLabels[type] || type}
                                        </span>
                                      </h4>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {(groupedItems[type] || []).map(item => (
                                          <div key={item.id} className="p-3 rounded-lg border border-gray-600 bg-gray-800/40">
                                            <p className="font-medium text-sm truncate">{item.component.name}</p>
                                            <p className="text-[10px] text-gray-500">{item.component.manufacturer}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}

                            {/* Aktionen */}
                            <div className="flex items-center gap-3 pt-2 border-t border-gray-700/50">
                              <button
                                onClick={() => setCheckLoadoutId(checkLoadoutId === selectedLoadout.id ? null : selectedLoadout.id)}
                                className={`btn text-sm ${checkLoadoutId === selectedLoadout.id ? 'btn-primary' : 'btn-secondary'}`}
                              >
                                {checkLoadoutId === selectedLoadout.id ? 'Check ausblenden' : 'Was fehlt mir?'}
                              </button>

                              {loadoutCheck && loadoutCheck.total_missing > 0 && (
                                <button
                                  onClick={() => requestMissingMutation.mutate(selectedLoadout.id)}
                                  disabled={requestMissingMutation.isPending}
                                  className="btn btn-primary text-sm flex items-center gap-1"
                                >
                                  <Send size={14} />
                                  Fehlende anfragen ({loadoutCheck.total_missing})
                                </button>
                              )}

                              {requestMissingMutation.isSuccess && (
                                <span className="text-sm text-green-400">
                                  {(requestMissingMutation.data as { created: number }).created} Anfragen erstellt
                                </span>
                              )}
                            </div>

                            {/* Check-Zusammenfassung */}
                            {loadoutCheck && checkLoadoutId === selectedLoadout.id && (
                              <div className="bg-gray-800/30 rounded-lg p-3 text-sm">
                                <div className="flex items-center gap-4">
                                  <span className="text-green-400">{loadoutCheck.total_owned} vorhanden</span>
                                  <span className="text-red-400">{loadoutCheck.total_missing} fehlen</span>
                                  <span className="text-gray-400">von {loadoutCheck.total_required} benötigt</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </div>
      )}

      {/* Component Search Modal */}
      <ComponentSearchModal
        isOpen={!!componentModal}
        onClose={() => setComponentModal(null)}
        onSelect={handleAssignComponent}
        filterSize={componentModal?.size}
        title={componentModal ? `Komponente wählen (S${componentModal.size})` : undefined}
      />
    </div>
  )
}
