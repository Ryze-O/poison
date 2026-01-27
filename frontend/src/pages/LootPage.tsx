import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import {
  Gift,
  Plus,
  X,
  Check,
  Edit3,
  MapPin,
  Calendar,
  Trash2,
  CheckCircle,
  Package,
  ChevronDown,
  ChevronUp,
  Users,
  PlusCircle,
  RotateCcw,
  Upload,
  Clipboard,
} from 'lucide-react'
import type { LootSession, LootItem, Component, Location, User, AttendanceSession, ScanResult, SessionType } from '../api/types'

// Fuzzy-Search: Normalisiert String für flexibleres Matching
// "TS2" findet "TS-2", "ts_2", "TS 2" etc.
const normalizeForSearch = (str: string): string => {
  return str.toLowerCase().replace(/[-_\s.]/g, '')
}

export default function LootPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [expandedSession, setExpandedSession] = useState<number | null>(null)
  const [editingSession, setEditingSession] = useState<LootSession | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Form states für neue Session - Datum mit aktuellem Wert vorbelegen
  const [newSessionDate, setNewSessionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newSessionNotes, setNewSessionNotes] = useState('')
  const [newSessionLocation, setNewSessionLocation] = useState<number | null>(null)
  const [newSessionType, setNewSessionType] = useState<SessionType>('freeplay')

  // OCR/Anwesenheit für neue Session
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [showManualSelection, setShowManualSelection] = useState(false)

  // Edit-Session: lokaler State für Notizen (um nicht bei jedem Tastendruck zu speichern)
  const [editNotes, setEditNotes] = useState('')

  // Form states für Item hinzufügen
  const [addingItem, setAddingItem] = useState(false)
  const [selectedComponent, setSelectedComponent] = useState<number | null>(null)
  const [itemQuantity, setItemQuantity] = useState(1)
  const [componentSearch, setComponentSearch] = useState('')
  const [componentCategoryFilter, setComponentCategoryFilter] = useState('')
  const [componentSubCategoryFilter, setComponentSubCategoryFilter] = useState('')

  // Form states für Verteilung
  const [distributingItem, setDistributingItem] = useState<LootItem | null>(null)
  const [distributeUserId, setDistributeUserId] = useState<number | null>(null)
  const [distributeQuantity, setDistributeQuantity] = useState(1)

  // Neuen Standort erstellen
  const [showNewLocationForm, setShowNewLocationForm] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationSystem, setNewLocationSystem] = useState('')
  const [newLocationPlanet, setNewLocationPlanet] = useState('')
  const [newLocationType, setNewLocationType] = useState('')

  // Verteilungs-Dialog beim Abschließen
  const [showDistributionDialog, setShowDistributionDialog] = useState(false)
  const [wantsLoot, setWantsLoot] = useState<Record<number, boolean>>({})
  const [selectedPioneers, setSelectedPioneers] = useState<Record<number, number | null>>({})
  const [distributionLocation, setDistributionLocation] = useState<number | null>(null)

  // Effektive Rolle (berücksichtigt Vorschaumodus)
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  // Offiziere, Treasurer, Admins und Pioneers dürfen Loot verwalten
  const canCreate = (effectiveRole !== 'member' && effectiveRole !== 'guest' && effectiveRole !== 'loot_guest') || user?.is_pioneer
  const isAdmin = effectiveRole === 'admin'

  const { data: sessions } = useQuery<LootSession[]>({
    queryKey: ['loot'],
    queryFn: () => apiClient.get('/api/loot').then((r) => r.data),
  })

  const { data: locations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
    enabled: editingSession !== null || isCreating || expandedSession !== null,
  })

  const { data: components } = useQuery<Component[]>({
    queryKey: ['components'],
    queryFn: () => apiClient.get('/api/items').then((r) => r.data),
    enabled: addingItem,
  })

  // Kategorien und Unterkategorien für Komponenten-Filter
  const { data: componentCategories } = useQuery<string[]>({
    queryKey: ['items', 'categories'],
    queryFn: () => apiClient.get('/api/items/categories').then((r) => r.data),
    enabled: addingItem,
  })

  const { data: componentSubCategories } = useQuery<string[]>({
    queryKey: ['items', 'sub-categories', componentCategoryFilter],
    queryFn: () => {
      const params = componentCategoryFilter ? `?category=${encodeURIComponent(componentCategoryFilter)}` : ''
      return apiClient.get(`/api/items/sub-categories${params}`).then((r) => r.data)
    },
    enabled: addingItem,
  })

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
    enabled: distributingItem !== null || showDistributionDialog || isCreating || expandedSession !== null,
  })

  // OCR-Scan Mutation
  const scanMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post('/api/attendance/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (response) => {
      setScanResult(response.data)
      setSelectedUsers(response.data.matched.map((m: { user_id: number }) => m.user_id))
    },
  })

  // Paste-Handler für Screenshots
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!isCreating) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            scanMutation.mutate(file)
          }
        }
      }
    },
    [isCreating, scanMutation]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // Aktuell aufgeklappte Session finden
  const currentExpandedSession = sessions?.find(s => s.id === expandedSession) || null

  // Attendance-Session laden (falls Loot-Session mit Attendance verknüpft)
  // Funktioniert für Modal UND Inline-Editing
  const activeSession = editingSession || currentExpandedSession
  const { data: attendanceSession } = useQuery<AttendanceSession>({
    queryKey: ['attendance', activeSession?.attendance_session_id],
    queryFn: () => apiClient.get(`/api/attendance/${activeSession?.attendance_session_id}`).then((r) => r.data),
    enabled: !!activeSession?.attendance_session_id && (distributingItem !== null || showDistributionDialog || expandedSession !== null),
  })

  // Anwesende User-IDs extrahieren
  const attendeeIds = useMemo(() => {
    if (!attendanceSession) return new Set<number>()
    return new Set(
      attendanceSession.records
        .filter(r => r.user)
        .map(r => r.user!.id)
    )
  }, [attendanceSession])

  // User sortiert: Anwesende zuerst, dann Rest
  const sortedUsers = useMemo((): { attendees: User[]; nonAttendees: User[] } => {
    if (!allUsers) return { attendees: [], nonAttendees: [] }
    const attendees = allUsers.filter(u => attendeeIds.has(u.id))
    const nonAttendees = allUsers.filter(u => !attendeeIds.has(u.id))
    return { attendees, nonAttendees }
  }, [allUsers, attendeeIds])

  // Locations für Verteilungs-Dialog laden
  const { data: distributionLocations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
    enabled: showDistributionDialog,
  })

  // Session erstellen (mit optionaler Attendance-Session)
  const createSessionMutation = useMutation({
    mutationFn: async (data: {
      date?: string
      notes?: string
      location_id?: number
      items?: unknown[]
      session_type?: SessionType
      records?: { user_id: number }[]
      screenshot_base64?: string
    }) => {
      // Wenn wir Teilnehmer haben, erst Attendance-Session erstellen
      if (data.records && data.records.length > 0) {
        const attendanceResponse = await apiClient.post('/api/attendance', {
          session_type: data.session_type || 'freeplay',
          notes: data.notes,
          records: data.records,
          screenshot_base64: data.screenshot_base64,
        })
        // Dann Loot-Session mit Attendance-Referenz
        return apiClient.post('/api/loot', {
          attendance_session_id: attendanceResponse.data.id,
          date: data.date,
          notes: data.notes,
          location_id: data.location_id,
          items: data.items || [],
        })
      }
      // Ohne Teilnehmer: nur Loot-Session
      return apiClient.post('/api/loot', {
        date: data.date,
        notes: data.notes,
        location_id: data.location_id,
        items: data.items || [],
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setIsCreating(false)
      setNewSessionDate(new Date().toISOString().split('T')[0])
      setNewSessionNotes('')
      setNewSessionLocation(null)
      setNewSessionType('freeplay')
      setScanResult(null)
      setSelectedUsers([])
      setShowManualSelection(false)
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      console.error('Fehler beim Erstellen:', error)
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  // Session updaten
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: number; data: { location_id?: number; date?: string; notes?: string; is_completed?: boolean } }) =>
      apiClient.patch(`/api/loot/${sessionId}`, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      if (editingSession) {
        setEditingSession(response.data)
      }
    },
  })

  // Session löschen
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => apiClient.delete(`/api/loot/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setEditingSession(null)
    },
  })

  // Item hinzufügen
  const addItemMutation = useMutation({
    mutationFn: ({ sessionId, componentId, quantity }: { sessionId: number; componentId: number; quantity: number }) =>
      apiClient.post(`/api/loot/${sessionId}/items`, { component_id: componentId, quantity }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      setEditingSession(response.data)
      setAddingItem(false)
      setSelectedComponent(null)
      setItemQuantity(1)
      setComponentSearch('')
    },
  })

  // Item löschen
  const deleteItemMutation = useMutation({
    mutationFn: ({ sessionId, itemId }: { sessionId: number; itemId: number }) =>
      apiClient.delete(`/api/loot/${sessionId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      // Session neu laden
      if (editingSession) {
        apiClient.get(`/api/loot/${editingSession.id}`).then((r) => setEditingSession(r.data))
      }
    },
  })

  // Item verteilen (einzeln)
  const distributeMutation = useMutation({
    mutationFn: ({ sessionId, itemId, userId, quantity }: { sessionId: number; itemId: number; userId: number; quantity: number }) =>
      apiClient.post(`/api/loot/${sessionId}/items/${itemId}/distribute`, { user_id: userId, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      setDistributingItem(null)
      setDistributeUserId(null)
      setDistributeQuantity(1)
      // Session neu laden
      if (editingSession) {
        apiClient.get(`/api/loot/${editingSession.id}`).then((r) => setEditingSession(r.data))
      }
    },
  })

  // Batch-Verteilung (mehrere User gleichzeitig)
  const batchDistributeMutation = useMutation({
    mutationFn: ({ sessionId, itemId, userIds, quantityPerUser, locationId }: {
      sessionId: number
      itemId: number
      userIds: number[]
      quantityPerUser: number
      locationId?: number
    }) =>
      apiClient.post(`/api/loot/${sessionId}/items/${itemId}/distribute-batch`, {
        user_ids: userIds,
        quantity_per_user: quantityPerUser,
        location_id: locationId || null
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loot'] })
      // Session neu laden
      if (editingSession) {
        apiClient.get(`/api/loot/${editingSession.id}`).then((r) => setEditingSession(r.data))
      }
    },
  })

  // Neuen Standort erstellen
  const createLocationMutation = useMutation({
    mutationFn: (data: { name: string; system_name?: string; planet_name?: string; location_type?: string }) =>
      apiClient.post('/api/locations', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Neuen Standort automatisch auswählen
      if (isCreating) {
        setNewSessionLocation(response.data.id)
      } else if (editingSession) {
        updateSessionMutation.mutate({
          sessionId: editingSession.id,
          data: { location_id: response.data.id }
        })
      }
      // Form zurücksetzen
      setShowNewLocationForm(false)
      setNewLocationName('')
      setNewLocationSystem('')
      setNewLocationPlanet('')
      setNewLocationType('')
    },
  })

  const openEditModal = (session: LootSession) => {
    setEditingSession(session)
    setEditNotes(session.notes || '')  // Lokalen State initialisieren
    setAddingItem(false)
    setDistributingItem(null)
  }

  const closeEditModal = () => {
    setEditingSession(null)
    setAddingItem(false)
    setDistributingItem(null)
  }

  const handleDeleteSession = (sessionId: number) => {
    if (window.confirm('Loot-Session wirklich löschen? Dies kann nicht rückgängig gemacht werden.')) {
      deleteSessionMutation.mutate(sessionId)
    }
  }

  // Öffnet den Verteilungs-Dialog beim Abschließen
  const openDistributionDialog = () => {
    if (!editingSession) return

    // Prüfen ob noch Items unverteilt sind
    const hasUndistributedItems = editingSession.items.some(item => {
      const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
      return item.quantity > distributed
    })

    if (!hasUndistributedItems) {
      // Alles verteilt → direkt abschließen
      updateSessionMutation.mutate({
        sessionId: editingSession.id,
        data: { is_completed: true }
      })
      return
    }

    // Dialog initialisieren
    const initialWantsLoot: Record<number, boolean> = {}
    const initialPioneers: Record<number, number | null> = {}

    // Für stackable Items: alle User wollen standardmäßig Loot
    // Für nicht-stackable: kein Pioneer ausgewählt
    if (allUsers) {
      allUsers.forEach(u => {
        initialWantsLoot[u.id] = true
      })
    }
    editingSession.items.forEach(item => {
      initialPioneers[item.id] = null
    })

    setWantsLoot(initialWantsLoot)
    setSelectedPioneers(initialPioneers)
    setDistributionLocation(editingSession.location?.id || null)
    setShowDistributionDialog(true)
  }

  // Schließt den Verteilungs-Dialog
  const closeDistributionDialog = () => {
    setShowDistributionDialog(false)
    setWantsLoot({})
    setSelectedPioneers({})
  }

  // Verteilt ein einzelnes Item (stackable oder nicht)
  const distributeItem = async (item: LootItem) => {
    if (!editingSession) return

    const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
    const remaining = item.quantity - distributed

    if (remaining === 0) return

    if (item.component.is_stackable) {
      // Stackable: Gleichmäßig auf alle die wollen
      const recipients = Object.entries(wantsLoot)
        .filter(([_, wants]) => wants)
        .map(([id]) => parseInt(id))

      if (recipients.length === 0) {
        alert('Mindestens ein Empfänger muss ausgewählt sein')
        return
      }

      const perPerson = Math.floor(remaining / recipients.length)
      if (perPerson === 0) {
        alert(`Nicht genug Items für ${recipients.length} Empfänger`)
        return
      }

      await batchDistributeMutation.mutateAsync({
        sessionId: editingSession.id,
        itemId: item.id,
        userIds: recipients,
        quantityPerUser: perPerson,
        locationId: distributionLocation || undefined
      })
    } else {
      // Nicht-stackable: An einzelnen Pioneer
      const pioneerId = selectedPioneers[item.id]
      if (!pioneerId) {
        alert('Bitte einen Pioneer auswählen')
        return
      }

      await batchDistributeMutation.mutateAsync({
        sessionId: editingSession.id,
        itemId: item.id,
        userIds: [pioneerId],
        quantityPerUser: remaining,
        locationId: distributionLocation || undefined
      })
    }
  }

  // Verteilt alle Items und schließt die Session ab
  const distributeAllAndComplete = async () => {
    if (!editingSession) return

    // Alle unverteilten Items verteilen
    for (const item of editingSession.items) {
      const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
      const remaining = item.quantity - distributed

      if (remaining > 0) {
        await distributeItem(item)
      }
    }

    // Session abschließen
    await updateSessionMutation.mutateAsync({
      sessionId: editingSession.id,
      data: { is_completed: true }
    })

    closeDistributionDialog()
    closeEditModal()
  }

  // Komponenten nach Kategorien gruppiert + Fuzzy-Search
  const filteredComponents = useMemo(() => {
    if (!components) return []

    const normalizedSearch = normalizeForSearch(componentSearch)

    return components.filter((c) => {
      // Kategorie-Filter
      if (componentCategoryFilter && c.category !== componentCategoryFilter) return false
      // Unterkategorie-Filter
      if (componentSubCategoryFilter && c.sub_category !== componentSubCategoryFilter) return false

      // Suche (Fuzzy-Match)
      if (componentSearch) {
        const normalizedName = normalizeForSearch(c.name)
        const normalizedCategory = c.category ? normalizeForSearch(c.category) : ''
        const normalizedSubCategory = c.sub_category ? normalizeForSearch(c.sub_category) : ''
        const normalizedManufacturer = c.manufacturer ? normalizeForSearch(c.manufacturer) : ''

        // Normale Suche (lowercase)
        const searchLower = componentSearch.toLowerCase()
        const matchesNormal =
          c.name.toLowerCase().includes(searchLower) ||
          c.category?.toLowerCase().includes(searchLower) ||
          c.sub_category?.toLowerCase().includes(searchLower) ||
          c.manufacturer?.toLowerCase().includes(searchLower)

        // Fuzzy-Suche (ohne Trennzeichen)
        const matchesFuzzy =
          normalizedName.includes(normalizedSearch) ||
          normalizedCategory.includes(normalizedSearch) ||
          normalizedSubCategory.includes(normalizedSearch) ||
          normalizedManufacturer.includes(normalizedSearch)

        return matchesNormal || matchesFuzzy
      }

      return true
    }).slice(0, 50)
  }, [components, componentSearch, componentCategoryFilter, componentSubCategoryFilter])

  // Komponenten nach Kategorien gruppieren für Dropdown-Anzeige
  const groupedComponents = useMemo(() => {
    const grouped: Record<string, Record<string, Component[]>> = {}

    for (const comp of filteredComponents) {
      const cat = comp.category || 'Sonstiges'
      const subCat = comp.sub_category || 'Allgemein'

      if (!grouped[cat]) grouped[cat] = {}
      if (!grouped[cat][subCat]) grouped[cat][subCat] = []
      grouped[cat][subCat].push(comp)
    }

    return grouped
  }, [filteredComponents])

  const getSessionDate = (session: LootSession) => {
    return session.date || session.created_at
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Loot-Verteilung</h1>
        {canCreate && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Neue Loot-Session
          </button>
        )}
      </div>

      {/* Neue Session erstellen */}
      {isCreating && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Neue Loot-Session</h2>
            <button onClick={() => {
              setIsCreating(false)
              setScanResult(null)
              setSelectedUsers([])
              setShowManualSelection(false)
            }} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>

          {/* Session-Typ */}
          <div className="mb-6">
            <label className="label">Session-Typ</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNewSessionType('loot_run')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  newSessionType === 'loot_run'
                    ? 'bg-krt-orange text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Loot-Run
              </button>
              <button
                type="button"
                onClick={() => setNewSessionType('freeplay')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  newSessionType === 'freeplay'
                    ? 'bg-krt-orange text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Freeplay
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="label">Datum</label>
              <input
                type="date"
                value={newSessionDate}
                onChange={(e) => setNewSessionDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Lootort</label>
              <div className="flex gap-2">
                <select
                  value={newSessionLocation || ''}
                  onChange={(e) => setNewSessionLocation(e.target.value ? parseInt(e.target.value) : null)}
                  className="input flex-1"
                >
                  <option value="">-- Kein Lootort --</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.system_name && `(${loc.system_name})`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewLocationForm(true)}
                  className="btn bg-gray-700 hover:bg-gray-600 flex items-center gap-1"
                  title="Neuen Lootort hinzufügen"
                >
                  <PlusCircle size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="label">Notizen</label>
            <input
              type="text"
              value={newSessionNotes}
              onChange={(e) => setNewSessionNotes(e.target.value)}
              placeholder="z.B. Mining-Run, Bunker-Raid..."
              className="input"
            />
          </div>

          {/* OCR Screenshot Upload */}
          <div className="mb-6">
            <label className="label">Teilnehmer per Screenshot (optional)</label>
            <label className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-krt-orange transition-colors">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-400">
                  <Upload size={20} />
                  <span className="text-sm">Datei auswählen</span>
                </div>
                <span className="text-gray-600">oder</span>
                <div className="flex items-center gap-2 text-krt-orange">
                  <Clipboard size={20} />
                  <span className="text-sm">Strg+V</span>
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) scanMutation.mutate(file)
                }}
              />
            </label>
            {scanMutation.isPending && (
              <p className="text-sm text-krt-orange mt-2">Scanne Screenshot...</p>
            )}
          </div>

          {/* OCR Ergebnis oder manuelle Auswahl */}
          {(scanResult || selectedUsers.length > 0 || showManualSelection) && (
            <div className="mb-6">
              <label className="label">Teilnehmer ({selectedUsers.length})</label>
              {scanResult && (
                <p className="text-sm text-gray-400 mb-2">
                  {scanResult.matched.length} erkannt, {scanResult.unmatched.length} nicht zugeordnet
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-800/50 rounded-lg">
                {allUsers?.filter(u => u.role !== 'guest').map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                      selectedUsers.includes(u.id)
                        ? 'bg-krt-orange/20 border border-krt-orange'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers([...selectedUsers, u.id])
                        } else {
                          setSelectedUsers(selectedUsers.filter((id) => id !== u.id))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm truncate">{u.display_name || u.username}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Teilnehmer manuell hinzufügen Button */}
          {!scanResult && selectedUsers.length === 0 && !showManualSelection && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowManualSelection(true)}
                className="text-sm text-krt-orange hover:underline flex items-center gap-1"
              >
                <Users size={16} />
                Teilnehmer manuell auswählen
              </button>
            </div>
          )}

          <button
            onClick={() => {
              createSessionMutation.mutate({
                date: newSessionDate || undefined,
                notes: newSessionNotes || undefined,
                location_id: newSessionLocation || undefined,
                session_type: newSessionType,
                records: selectedUsers.map((id) => ({ user_id: id })),
                screenshot_base64: scanResult?.screenshot_base64,
                items: [],
              })
            }}
            disabled={createSessionMutation.isPending}
            className="btn btn-primary"
          >
            {createSessionMutation.isPending ? 'Erstellen...' : 'Session erstellen'}
          </button>
        </div>
      )}

      {/* Info */}
      <div className="card mb-8 bg-krt-orange/10 border-krt-orange/30">
        <div className="flex items-start gap-4">
          <Gift className="text-krt-orange mt-1" size={24} />
          <div>
            <h3 className="font-bold mb-1">So funktioniert die Loot-Verteilung</h3>
            <ol className="text-gray-300 space-y-1 text-sm list-decimal list-inside">
              <li>Erstelle eine Loot-Session mit Session-Typ (Loot-Run/Freeplay)</li>
              <li>Lade optional einen Screenshot für OCR-Erkennung der Teilnehmer hoch</li>
              <li>Klicke auf "Bearbeiten" um Loot-Items hinzuzufügen</li>
              <li>Verteile den Loot auf die Teilnehmer</li>
              <li>Die Items landen automatisch im jeweiligen Lager</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Loot Sessions */}
      <div className="space-y-4">
        {sessions && sessions.length > 0 ? (
          sessions.map((session) => {
            const totalItems = session.items.reduce((sum, item) => sum + item.quantity, 0)
            const totalDistributed = session.items.reduce(
              (sum, item) => sum + item.distributions.reduce((s, d) => s + d.quantity, 0),
              0
            )

            return (
              <div key={session.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                      className="text-gray-400 hover:text-white"
                    >
                      {expandedSession === session.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                    <div>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        {new Date(getSessionDate(session)).toLocaleDateString('de-DE', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        {session.is_completed && (
                          <span title="Abgeschlossen">
                            <CheckCircle size={18} className="text-green-500" />
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        {session.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={14} />
                            {session.location.name}
                          </span>
                        )}
                        {session.notes && <span>{session.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm text-gray-500">
                        von {session.created_by.display_name || session.created_by.username}
                      </span>
                      <div className="text-sm">
                        <span className={totalDistributed === totalItems && totalItems > 0 ? 'text-green-500' : 'text-yellow-500'}>
                          {totalDistributed}/{totalItems} Items verteilt
                        </span>
                      </div>
                    </div>
                    {canCreate && session.is_completed && (
                      <button
                        onClick={() => openEditModal(session)}
                        className="btn bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-2"
                      >
                        <Edit3 size={16} />
                        Details
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Content - Inline Editing */}
                {expandedSession === session.id && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    {/* Session Details (editierbar wenn canCreate und nicht abgeschlossen) */}
                    {canCreate && !session.is_completed && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-800/30 rounded-lg">
                        <div>
                          <label className="label flex items-center gap-1 text-xs">
                            <Calendar size={12} />
                            Datum
                          </label>
                          <input
                            type="date"
                            value={session.date ? session.date.split('T')[0] : ''}
                            onChange={(e) => updateSessionMutation.mutate({
                              sessionId: session.id,
                              data: { date: e.target.value ? new Date(e.target.value).toISOString() : undefined }
                            })}
                            className="input text-sm"
                          />
                        </div>
                        <div>
                          <label className="label flex items-center gap-1 text-xs">
                            <MapPin size={12} />
                            Lootort
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={session.location?.id || ''}
                              onChange={(e) => updateSessionMutation.mutate({
                                sessionId: session.id,
                                data: { location_id: e.target.value ? parseInt(e.target.value) : 0 }
                              })}
                              className="input flex-1 text-sm"
                            >
                              <option value="">-- Kein Lootort --</option>
                              {locations?.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name} {loc.system_name && `(${loc.system_name})`}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                openEditModal(session)
                                setShowNewLocationForm(true)
                              }}
                              className="btn bg-gray-700 hover:bg-gray-600 p-2"
                              title="Neuen Lootort hinzufügen"
                            >
                              <PlusCircle size={16} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="label text-xs">Notizen</label>
                          <input
                            type="text"
                            defaultValue={session.notes || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (session.notes || '')) {
                                updateSessionMutation.mutate({
                                  sessionId: session.id,
                                  data: { notes: e.target.value }
                                })
                              }
                            }}
                            placeholder="z.B. Mining-Run..."
                            className="input text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Loot Items Überschrift mit Add-Button */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-400">
                        Loot-Items ({session.items.length})
                      </h4>
                      {canCreate && !session.is_completed && !addingItem && (
                        <button
                          onClick={() => {
                            openEditModal(session)
                            setAddingItem(true)
                          }}
                          className="btn bg-gray-700 hover:bg-gray-600 text-xs flex items-center gap-1 py-1.5"
                        >
                          <Plus size={14} />
                          Item hinzufügen
                        </button>
                      )}
                    </div>

                    {/* Items Liste mit Inline-Actions */}
                    {session.items.length > 0 ? (
                      <div className="space-y-3">
                        {session.items.map((item) => {
                          const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
                          const remaining = item.quantity - distributed

                          return (
                            <div key={item.id} className="p-4 bg-gray-800/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium">{item.component.name}</p>
                                  {item.component.category && (
                                    <p className="text-xs text-gray-500">{item.component.category}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm ${remaining === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                                    {distributed}/{item.quantity} verteilt
                                  </span>
                                  {canCreate && !session.is_completed && remaining > 0 && (
                                    <button
                                      onClick={() => {
                                        setDistributingItem(item)
                                        setDistributeQuantity(1)
                                        setDistributeUserId(null)
                                      }}
                                      className="btn bg-krt-orange hover:bg-krt-orange/80 text-xs py-1 px-2 flex items-center gap-1"
                                    >
                                      <Users size={12} />
                                      Verteilen
                                    </button>
                                  )}
                                  {canCreate && !session.is_completed && item.distributions.length === 0 && (
                                    <button
                                      onClick={() => deleteItemMutation.mutate({
                                        sessionId: session.id,
                                        itemId: item.id
                                      })}
                                      disabled={deleteItemMutation.isPending}
                                      className="text-red-400 hover:text-red-300 p-1"
                                      title="Entfernen"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Inline Verteilungs-Dialog */}
                              {distributingItem?.id === item.id && (
                                <div className="mt-3 p-3 bg-gray-900 rounded border border-krt-orange">
                                  <div className="flex items-center gap-3 mb-2">
                                    <select
                                      value={distributeUserId || ''}
                                      onChange={(e) => setDistributeUserId(e.target.value ? parseInt(e.target.value) : null)}
                                      className="input flex-1 text-sm"
                                    >
                                      <option value="">-- User wählen --</option>
                                      {sortedUsers.attendees.length > 0 && (
                                        <optgroup label="Anwesend">
                                          {sortedUsers.attendees.map((u) => (
                                            <option key={u.id} value={u.id}>
                                              {u.display_name || u.username}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {sortedUsers.nonAttendees.length > 0 && (
                                        <optgroup label={sortedUsers.attendees.length > 0 ? "Nicht anwesend" : "Alle User"}>
                                          {sortedUsers.nonAttendees.map((u) => (
                                            <option key={u.id} value={u.id}>
                                              {u.display_name || u.username}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </select>
                                    <input
                                      type="number"
                                      min="1"
                                      max={remaining}
                                      value={distributeQuantity}
                                      onChange={(e) => setDistributeQuantity(Math.min(parseInt(e.target.value) || 1, remaining))}
                                      className="input w-16 text-sm"
                                    />
                                    <button
                                      onClick={() => {
                                        if (distributeUserId) {
                                          distributeMutation.mutate({
                                            sessionId: session.id,
                                            itemId: item.id,
                                            userId: distributeUserId,
                                            quantity: distributeQuantity,
                                          })
                                        }
                                      }}
                                      disabled={!distributeUserId || distributeMutation.isPending}
                                      className="btn btn-primary py-1.5 px-2"
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      onClick={() => setDistributingItem(null)}
                                      className="text-gray-400 hover:text-white"
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    {remaining} von {item.quantity} verfügbar
                                  </p>
                                </div>
                              )}

                              {/* Bestehende Verteilungen */}
                              {item.distributions.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {item.distributions.map((dist) => (
                                    <span key={dist.id} className="px-2 py-1 bg-gray-700 rounded text-sm">
                                      {dist.user.display_name || dist.user.username}: {dist.quantity}x
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        Keine Items - {canCreate && !session.is_completed ? 'füge welche hinzu!' : 'keine Loot-Items erfasst.'}
                      </p>
                    )}

                    {/* Action Buttons */}
                    {canCreate && (
                      <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between">
                        <div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              disabled={deleteSessionMutation.isPending}
                              className="btn bg-red-600/50 hover:bg-red-600 text-sm flex items-center gap-2"
                            >
                              <Trash2 size={14} />
                              Löschen
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {session.is_completed ? (
                            <button
                              onClick={() => updateSessionMutation.mutate({
                                sessionId: session.id,
                                data: { is_completed: false }
                              })}
                              disabled={updateSessionMutation.isPending}
                              className="btn bg-yellow-600 hover:bg-yellow-700 text-sm flex items-center gap-2"
                            >
                              <RotateCcw size={14} />
                              Wieder öffnen
                            </button>
                          ) : (
                            <button
                              onClick={() => openEditModal(session)}
                              disabled={updateSessionMutation.isPending || session.items.length === 0}
                              className="btn btn-primary text-sm flex items-center gap-2"
                            >
                              <CheckCircle size={14} />
                              Abschließen...
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="card text-center py-12">
            <Gift className="mx-auto text-gray-600 mb-4" size={48} />
            <p className="text-gray-400">Noch keine Loot-Sessions vorhanden.</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package size={24} />
                Loot-Session bearbeiten
                {editingSession.is_completed && (
                  <span className="text-sm font-normal text-green-500 flex items-center gap-1">
                    <CheckCircle size={16} /> Abgeschlossen
                  </span>
                )}
              </h2>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Session Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-800/50 rounded-lg">
              <div>
                <label className="label flex items-center gap-1">
                  <Calendar size={14} />
                  Datum
                </label>
                <input
                  type="date"
                  value={editingSession.date ? editingSession.date.split('T')[0] : ''}
                  onChange={(e) => updateSessionMutation.mutate({
                    sessionId: editingSession.id,
                    data: { date: e.target.value ? new Date(e.target.value).toISOString() : undefined }
                  })}
                  disabled={editingSession.is_completed}
                  className="input"
                />
              </div>
              <div>
                <label className="label flex items-center gap-1">
                  <MapPin size={14} />
                  Lootort
                </label>
                <div className="flex gap-2">
                  <select
                    value={editingSession.location?.id || ''}
                    onChange={(e) => updateSessionMutation.mutate({
                      sessionId: editingSession.id,
                      data: { location_id: e.target.value ? parseInt(e.target.value) : 0 }
                    })}
                    disabled={editingSession.is_completed}
                    className="input flex-1"
                  >
                    <option value="">-- Kein Lootort --</option>
                    {locations?.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.system_name && `(${loc.system_name})`}
                      </option>
                    ))}
                  </select>
                  {!editingSession.is_completed && (
                    <button
                      type="button"
                      onClick={() => setShowNewLocationForm(true)}
                      className="btn bg-gray-700 hover:bg-gray-600 flex items-center gap-1"
                      title="Neuen Lootort hinzufügen"
                    >
                      <PlusCircle size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Notizen</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => {
                    if (editNotes !== (editingSession.notes || '')) {
                      updateSessionMutation.mutate({
                        sessionId: editingSession.id,
                        data: { notes: editNotes }
                      })
                    }
                  }}
                  disabled={editingSession.is_completed}
                  placeholder="z.B. Mining-Run..."
                  className="input"
                />
              </div>
            </div>

            {/* Loot Items */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Loot-Items ({editingSession.items.length})</h3>
                {!editingSession.is_completed && !addingItem && (
                  <button
                    onClick={() => setAddingItem(true)}
                    className="btn bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Item hinzufügen
                  </button>
                )}
              </div>

              {/* Item hinzufügen Form */}
              {addingItem && (
                <div className="p-4 bg-gray-800 rounded-lg mb-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Neues Item</h4>
                    <button onClick={() => {
                      setAddingItem(false)
                      setComponentSearch('')
                      setComponentCategoryFilter('')
                      setComponentSubCategoryFilter('')
                      setSelectedComponent(null)
                    }} className="text-gray-400 hover:text-white">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Kategorien-Filter */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Kategorie</label>
                      <select
                        value={componentCategoryFilter}
                        onChange={(e) => {
                          setComponentCategoryFilter(e.target.value)
                          setComponentSubCategoryFilter('')
                          setSelectedComponent(null)
                        }}
                        className="input"
                      >
                        <option value="">Alle Kategorien</option>
                        {componentCategories?.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Unterkategorie</label>
                      <select
                        value={componentSubCategoryFilter}
                        onChange={(e) => {
                          setComponentSubCategoryFilter(e.target.value)
                          setSelectedComponent(null)
                        }}
                        className="input"
                      >
                        <option value="">Alle Unterkategorien</option>
                        {componentSubCategories?.map((sub) => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Suche + Menge */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-3">
                      <label className="label">Suche (auch "TS2" findet "TS-2")</label>
                      <input
                        type="text"
                        value={componentSearch}
                        onChange={(e) => {
                          setComponentSearch(e.target.value)
                          setSelectedComponent(null)
                        }}
                        placeholder="Name, Hersteller..."
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Menge</label>
                      <input
                        type="number"
                        min="1"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Ergebnisse - Gruppiert nach Kategorie/Unterkategorie */}
                  {(componentSearch || componentCategoryFilter || componentSubCategoryFilter) && filteredComponents.length > 0 && (
                    <div className="mt-3 max-h-64 overflow-y-auto bg-gray-900 rounded border border-gray-700">
                      {Object.entries(groupedComponents).map(([category, subCategories]) => (
                        <div key={category}>
                          <div className="sticky top-0 bg-gray-800 px-3 py-1.5 text-xs font-bold text-krt-orange border-b border-gray-700">
                            {category}
                          </div>
                          {Object.entries(subCategories).map(([subCategory, items]) => (
                            <div key={subCategory}>
                              {subCategory !== 'Allgemein' && (
                                <div className="px-3 py-1 text-xs text-gray-500 bg-gray-800/50">
                                  {subCategory}
                                </div>
                              )}
                              {items.map((comp) => (
                                <button
                                  key={comp.id}
                                  onClick={() => {
                                    setSelectedComponent(comp.id)
                                    setComponentSearch(comp.name)
                                  }}
                                  className={`w-full text-left px-3 py-2 hover:bg-gray-700 text-sm border-b border-gray-800 ${
                                    selectedComponent === comp.id ? 'bg-krt-orange/20 border-krt-orange' : ''
                                  }`}
                                >
                                  <span className="font-medium">{comp.name}</span>
                                  {comp.manufacturer && (
                                    <span className="text-gray-500 ml-2 text-xs">({comp.manufacturer})</span>
                                  )}
                                  {comp.size && (
                                    <span className="text-gray-600 ml-1 text-xs">S{comp.size}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {(componentSearch || componentCategoryFilter || componentSubCategoryFilter) && filteredComponents.length === 0 && (
                    <p className="mt-3 text-gray-500 text-sm">Keine Items gefunden.</p>
                  )}

                  <button
                    onClick={() => {
                      if (selectedComponent) {
                        addItemMutation.mutate({
                          sessionId: editingSession.id,
                          componentId: selectedComponent,
                          quantity: itemQuantity,
                        })
                        setComponentSearch('')
                        setComponentCategoryFilter('')
                        setComponentSubCategoryFilter('')
                      }
                    }}
                    disabled={!selectedComponent || addItemMutation.isPending}
                    className="btn btn-primary mt-3"
                  >
                    {addItemMutation.isPending ? 'Hinzufügen...' : 'Hinzufügen'}
                  </button>
                </div>
              )}

              {/* Items Liste */}
              <div className="space-y-3">
                {editingSession.items.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Keine Items - füge welche hinzu!</p>
                ) : (
                  editingSession.items.map((item) => {
                    const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
                    const remaining = item.quantity - distributed

                    return (
                      <div key={item.id} className="p-4 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium">{item.component.name}</p>
                            {item.component.category && (
                              <p className="text-sm text-gray-500">{item.component.category}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm ${remaining === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                              {distributed}/{item.quantity} verteilt
                            </span>
                            {!editingSession.is_completed && remaining > 0 && (
                              <button
                                onClick={() => {
                                  setDistributingItem(item)
                                  setDistributeQuantity(1)
                                }}
                                className="btn bg-krt-orange hover:bg-krt-orange/80 text-sm flex items-center gap-1"
                              >
                                <Users size={14} />
                                Verteilen
                              </button>
                            )}
                            {!editingSession.is_completed && item.distributions.length === 0 && (
                              <button
                                onClick={() => deleteItemMutation.mutate({
                                  sessionId: editingSession.id,
                                  itemId: item.id
                                })}
                                disabled={deleteItemMutation.isPending}
                                className="text-red-400 hover:text-red-300 p-1"
                                title="Entfernen"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Verteilungs-Dialog */}
                        {distributingItem?.id === item.id && (
                          <div className="mt-3 p-3 bg-gray-900 rounded border border-krt-orange">
                            <div className="flex items-center gap-3 mb-3">
                              <select
                                value={distributeUserId || ''}
                                onChange={(e) => setDistributeUserId(e.target.value ? parseInt(e.target.value) : null)}
                                className="input flex-1"
                              >
                                <option value="">-- User wählen --</option>
                                {sortedUsers.attendees.length > 0 && (
                                  <optgroup label="Anwesend">
                                    {sortedUsers.attendees.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.display_name || u.username}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {sortedUsers.nonAttendees.length > 0 && (
                                  <optgroup label={sortedUsers.attendees.length > 0 ? "Nicht anwesend" : "Alle User"}>
                                    {sortedUsers.nonAttendees.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.display_name || u.username}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              <input
                                type="number"
                                min="1"
                                max={remaining}
                                value={distributeQuantity}
                                onChange={(e) => setDistributeQuantity(Math.min(parseInt(e.target.value) || 1, remaining))}
                                className="input w-20"
                              />
                              <button
                                onClick={() => {
                                  if (distributeUserId) {
                                    distributeMutation.mutate({
                                      sessionId: editingSession.id,
                                      itemId: item.id,
                                      userId: distributeUserId,
                                      quantity: distributeQuantity,
                                    })
                                  }
                                }}
                                disabled={!distributeUserId || distributeMutation.isPending}
                                className="btn btn-primary flex items-center gap-1"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => setDistributingItem(null)}
                                className="text-gray-400 hover:text-white"
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <p className="text-sm text-gray-500">
                              {remaining} von {item.quantity} verfügbar
                            </p>
                          </div>
                        )}

                        {/* Bestehende Verteilungen */}
                        {item.distributions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {item.distributions.map((dist) => (
                              <span key={dist.id} className="px-2 py-1 bg-gray-700 rounded text-sm">
                                {dist.user.display_name || dist.user.username}: {dist.quantity}x
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="flex justify-between">
                {/* Löschen (Admin only) */}
                <div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteSession(editingSession.id)}
                      disabled={deleteSessionMutation.isPending}
                      className="btn bg-red-600 hover:bg-red-700 flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      {deleteSessionMutation.isPending ? 'Löschen...' : 'Session löschen'}
                    </button>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={closeEditModal} className="btn bg-gray-700 hover:bg-gray-600">
                    Schließen
                  </button>
                  {editingSession.is_completed ? (
                    <button
                      onClick={() => updateSessionMutation.mutate({
                        sessionId: editingSession.id,
                        data: { is_completed: false }
                      })}
                      disabled={updateSessionMutation.isPending}
                      className="btn bg-yellow-600 hover:bg-yellow-700 flex items-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Session wieder öffnen
                    </button>
                  ) : (
                    <button
                      onClick={openDistributionDialog}
                      disabled={updateSessionMutation.isPending}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      <CheckCircle size={16} />
                      Session abschließen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Neuer Lootort Popup-Modal */}
      {showNewLocationForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
          <div className="card max-w-lg w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={24} className="text-krt-orange" />
                Neuen Lootort erstellen
              </h2>
              <button
                onClick={() => {
                  setShowNewLocationForm(false)
                  setNewLocationName('')
                  setNewLocationSystem('')
                  setNewLocationPlanet('')
                  setNewLocationType('')
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="z.B. Ruin Station, GrimHEX..."
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">System</label>
                <select
                  value={newLocationSystem}
                  onChange={(e) => setNewLocationSystem(e.target.value)}
                  className="input"
                >
                  <option value="">-- System wählen --</option>
                  <option value="Stanton">Stanton</option>
                  <option value="Pyro">Pyro</option>
                  <option value="Nyx">Nyx</option>
                </select>
              </div>
              <div>
                <label className="label">Planet/Mond</label>
                <input
                  type="text"
                  value={newLocationPlanet}
                  onChange={(e) => setNewLocationPlanet(e.target.value)}
                  placeholder="z.B. microTech, Pyro I..."
                  className="input"
                />
              </div>
              <div>
                <label className="label">Typ</label>
                <select
                  value={newLocationType}
                  onChange={(e) => setNewLocationType(e.target.value)}
                  className="input"
                >
                  <option value="">-- Typ wählen --</option>
                  <option value="Station">Station</option>
                  <option value="Landing Zone">Landing Zone</option>
                  <option value="Outpost">Outpost</option>
                  <option value="Bunker">Bunker</option>
                  <option value="Cave">Cave</option>
                  <option value="Asteroid">Asteroid</option>
                  <option value="Wreck">Wreck</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewLocationForm(false)
                  setNewLocationName('')
                  setNewLocationSystem('')
                  setNewLocationPlanet('')
                  setNewLocationType('')
                }}
                className="btn bg-gray-700 hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (newLocationName.trim()) {
                    createLocationMutation.mutate({
                      name: newLocationName.trim(),
                      system_name: newLocationSystem || undefined,
                      planet_name: newLocationPlanet || undefined,
                      location_type: newLocationType || undefined,
                    })
                  }
                }}
                disabled={!newLocationName.trim() || createLocationMutation.isPending}
                className="btn btn-primary"
              >
                {createLocationMutation.isPending ? 'Erstellen...' : 'Lootort erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verteilungs-Dialog beim Abschließen */}
      {showDistributionDialog && editingSession && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Gift size={24} className="text-krt-orange" />
                Loot verteilen
              </h2>
              <button onClick={closeDistributionDialog} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Standort-Auswahl (global) */}
            <div className="mb-6 p-4 bg-gray-800/50 rounded-lg">
              <label className="label flex items-center gap-2">
                <MapPin size={16} />
                Einlagerungsort für alle
              </label>
              <select
                value={distributionLocation || ''}
                onChange={(e) => setDistributionLocation(e.target.value ? parseInt(e.target.value) : null)}
                className="input"
              >
                <option value="">-- Kein Standort --</option>
                {(distributionLocations || locations)?.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.system_name && `(${loc.system_name})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Items zur Verteilung */}
            <div className="space-y-4">
              {editingSession.items.map((item) => {
                const distributed = item.distributions.reduce((sum, d) => sum + d.quantity, 0)
                const remaining = item.quantity - distributed
                const isStackable = item.component.is_stackable

                if (remaining === 0) {
                  return (
                    <div key={item.id} className="p-4 bg-green-900/20 rounded-lg border border-green-700">
                      <div className="flex items-center gap-2 text-green-500">
                        <CheckCircle size={18} />
                        <span className="font-medium">{item.component.name}</span>
                        <span className="text-sm">- Vollständig verteilt</span>
                      </div>
                    </div>
                  )
                }

                if (isStackable) {
                  // === TEILBARE ITEMS (Erze etc.) ===
                  const recipients = Object.entries(wantsLoot)
                    .filter(([_, wants]) => wants)
                    .map(([id]) => parseInt(id))
                  const perPerson = recipients.length > 0 ? Math.floor(remaining / recipients.length) : 0
                  const leftover = recipients.length > 0 ? remaining % recipients.length : remaining

                  return (
                    <div key={item.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{item.component.name}</h3>
                          <p className="text-sm text-gray-400">{item.component.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-krt-orange">{remaining}x</p>
                          <p className="text-sm text-gray-500">verfügbar</p>
                        </div>
                      </div>

                      <div className="bg-krt-orange/10 p-3 rounded mb-3">
                        <p className="text-sm">
                          <span className="text-krt-orange font-medium">Teilbar:</span>{' '}
                          {recipients.length > 0 ? (
                            <>
                              {perPerson}x an jeden der {recipients.length} Empfänger
                              {leftover > 0 && <span className="text-yellow-500"> ({leftover} Rest)</span>}
                            </>
                          ) : (
                            <span className="text-yellow-500">Keine Empfänger ausgewählt</span>
                          )}
                        </p>
                      </div>

                      {/* Teilnehmer-Checkboxen - Anwesende zuerst */}
                      {sortedUsers.attendees.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-emerald-500 font-medium mb-1">Anwesend:</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {sortedUsers.attendees.map((u) => (
                              <label
                                key={u.id}
                                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                  wantsLoot[u.id] ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700/50 border border-gray-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={wantsLoot[u.id] || false}
                                  onChange={(e) => setWantsLoot({ ...wantsLoot, [u.id]: e.target.checked })}
                                  className="rounded"
                                />
                                <span className={wantsLoot[u.id] ? 'text-green-400' : 'text-gray-400'}>
                                  {u.display_name || u.username}
                                </span>
                                {wantsLoot[u.id] && perPerson > 0 && (
                                  <span className="ml-auto text-green-500 text-sm">→{perPerson}x</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {sortedUsers.nonAttendees.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-500 font-medium mb-1">
                            {sortedUsers.attendees.length > 0 ? 'Nicht anwesend:' : 'Alle User:'}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {sortedUsers.nonAttendees.map((u) => (
                              <label
                                key={u.id}
                                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                  wantsLoot[u.id] ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700/50 border border-gray-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={wantsLoot[u.id] || false}
                                  onChange={(e) => setWantsLoot({ ...wantsLoot, [u.id]: e.target.checked })}
                                  className="rounded"
                                />
                                <span className={wantsLoot[u.id] ? 'text-green-400' : 'text-gray-400'}>
                                  {u.display_name || u.username}
                                </span>
                                {wantsLoot[u.id] && perPerson > 0 && (
                                  <span className="ml-auto text-green-500 text-sm">→{perPerson}x</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => distributeItem(item)}
                        disabled={recipients.length === 0 || perPerson === 0 || batchDistributeMutation.isPending}
                        className="btn btn-primary w-full"
                      >
                        {batchDistributeMutation.isPending ? 'Verteile...' : `Gleichmäßig verteilen (${perPerson}x an ${recipients.length} Personen)`}
                      </button>
                    </div>
                  )
                } else {
                  // === NICHT-TEILBARE ITEMS (Komponenten) ===
                  const selectedPioneer = selectedPioneers[item.id]
                  const officers = allUsers?.filter(u => u.role !== 'member') || []

                  return (
                    <div key={item.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{item.component.name}</h3>
                          <p className="text-sm text-gray-400">{item.component.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-krt-orange">{remaining}x</p>
                          <p className="text-sm text-gray-500">verfügbar</p>
                        </div>
                      </div>

                      <div className="bg-yellow-900/20 p-3 rounded mb-3">
                        <p className="text-sm">
                          <span className="text-yellow-500 font-medium">Einzelstück:</span>{' '}
                          Geht komplett an einen Pioneer zur späteren Verteilung
                        </p>
                      </div>

                      {/* Pioneer-Auswahl (nur Offiziere+) - Anwesende zuerst */}
                      <div className="mb-3">
                        <label className="label">Pioneer auswählen (Offizier+)</label>
                        <select
                          value={selectedPioneer || ''}
                          onChange={(e) => setSelectedPioneers({
                            ...selectedPioneers,
                            [item.id]: e.target.value ? parseInt(e.target.value) : null
                          })}
                          className="input"
                        >
                          <option value="">-- Pioneer wählen --</option>
                          {(() => {
                            const attendingOfficers = officers.filter(u => attendeeIds.has(u.id))
                            const nonAttendingOfficers = officers.filter(u => !attendeeIds.has(u.id))
                            return (
                              <>
                                {attendingOfficers.length > 0 && (
                                  <optgroup label="Anwesend">
                                    {attendingOfficers.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.display_name || u.username} ({u.role})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {nonAttendingOfficers.length > 0 && (
                                  <optgroup label={attendingOfficers.length > 0 ? "Nicht anwesend" : "Alle Offiziere"}>
                                    {nonAttendingOfficers.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.display_name || u.username} ({u.role})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            )
                          })()}
                        </select>
                      </div>

                      <button
                        onClick={() => distributeItem(item)}
                        disabled={!selectedPioneer || batchDistributeMutation.isPending}
                        className="btn btn-primary w-full"
                      >
                        {batchDistributeMutation.isPending ? 'Übergebe...' : `An Pioneer übergeben (${remaining}x)`}
                      </button>
                    </div>
                  )
                }
              })}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-700 flex justify-between">
              <button
                onClick={closeDistributionDialog}
                className="btn bg-gray-700 hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={distributeAllAndComplete}
                disabled={batchDistributeMutation.isPending || updateSessionMutation.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                <CheckCircle size={16} />
                {batchDistributeMutation.isPending || updateSessionMutation.isPending
                  ? 'Verarbeite...'
                  : 'Alles verteilen & abschließen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
