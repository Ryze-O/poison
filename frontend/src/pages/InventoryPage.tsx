import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Minus, ArrowRight, Search, History, Package, MapPin, ArrowRightLeft, ChevronDown, ChevronRight, Bell, Check, X, Send, Copy, Truck, MessageCircle, Clock } from 'lucide-react'
import AutocompleteInput, { AutocompleteSuggestion } from '../components/AutocompleteInput'
import type { InventoryItem, User, Component, Location, TransferRequest, PendingRequestsCount, ComponentSearchResult, InventoryDashboard } from '../api/types'

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
  add: 'text-white',
  remove: 'text-gray-500',
  loot: 'text-krt-orange',
  transfer_in: 'text-krt-orange',
  transfer_out: 'text-gray-400',
}

export default function InventoryPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [quickAddMode, setQuickAddMode] = useState(true) // Quick-Add standardmäßig an
  const [quickAddCount, setQuickAddCount] = useState(0) // Zähler für hinzugefügte Items
  const [lastLocationId, setLastLocationId] = useState<number | null>(null) // Letzter Standort merken
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
  // Transfer Request States
  const [showTransferRequests, setShowTransferRequests] = useState(false)
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [orderSearchResults, setOrderSearchResults] = useState<TransferRequest[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  // Comment Modal
  const [commentModal, setCommentModal] = useState<{
    requestId: number
    orderNumber: string | null
    currentPioneerComment: string | null
    currentPublicComment: string | null
  } | null>(null)
  const [pioneerComment, setPioneerComment] = useState('')
  const [publicComment, setPublicComment] = useState('')
  const [requestModal, setRequestModal] = useState<{
    ownerId: number
    ownerName: string
    component: Component
    quantity: number
    locationId: number | null
  } | null>(null)
  const [requestAmount, setRequestAmount] = useState(1)
  const [requestNotes, setRequestNotes] = useState('')
  // Rejection Modal
  const [rejectModal, setRejectModal] = useState<{
    requestId: number
    componentName: string
    requesterName: string
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // Move Location Modal
  const [moveModal, setMoveModal] = useState<{
    itemId: number
    componentName: string
    quantity: number
    currentLocationId: number | null
    currentLocationName: string
  } | null>(null)
  const [moveToLocation, setMoveToLocation] = useState<number | null>(null)
  const [moveQuantity, setMoveQuantity] = useState(1)
  // Komponenten-Suche & Dashboard
  const [componentSearch, setComponentSearch] = useState('')
  const [componentSearchResults, setComponentSearchResults] = useState<ComponentSearchResult[] | null>(null)
  const [isSearchingComponents, setIsSearchingComponents] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)

  // Effektive Rolle (berücksichtigt Vorschaumodus)
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  // canManage: Kann eigenes Lager aktiv verwalten (hinzufügen/entfernen)
  const canManage = effectiveRole !== 'member' && effectiveRole !== 'guest' && effectiveRole !== 'loot_guest'
  // hasInventory: Hat Zugriff auf Lager-Funktionen (alle außer Guest/Loot-Guest)
  const hasInventory = !!user && effectiveRole !== 'guest' && effectiveRole !== 'loot_guest'
  const isAdmin = effectiveRole === 'admin'
  const isPioneer = user?.is_pioneer ?? false

  // URL-Parameter verarbeiten (z.B. ?requests=open)
  useEffect(() => {
    if (searchParams.get('requests') === 'open') {
      setShowTransferRequests(true)
      // Parameter entfernen nach dem Öffnen
      searchParams.delete('requests')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

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
    enabled: hasInventory,  // Alle User mit Lager-Zugang
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

  // Locations nach System und Planet gruppieren und alphabetisch sortieren
  const groupedLocations = useMemo(() => {
    if (!locations) return { groups: {} as Record<string, { id: number; name: string; label: string }[]>, sortedSystems: [] as string[] }

    const systemOrder = ['Stanton', 'Pyro', 'Nyx']

    // Gruppiere nach System → Planet → Locations
    const bySystemAndPlanet: Record<string, Record<string, Location[]>> = {}

    locations.forEach(loc => {
      const system = loc.system_name || '_other'
      const planet = loc.planet_name || '_none'

      if (!bySystemAndPlanet[system]) bySystemAndPlanet[system] = {}
      if (!bySystemAndPlanet[system][planet]) bySystemAndPlanet[system][planet] = []
      bySystemAndPlanet[system][planet].push(loc)
    })

    // Erstelle flache Liste pro System mit Planet-Labels
    const groups: Record<string, { id: number; name: string; label: string }[]> = {}

    Object.entries(bySystemAndPlanet).forEach(([system, planets]) => {
      const displaySystem = system === '_other' ? 'Sonstige' : system
      if (!groups[displaySystem]) groups[displaySystem] = []

      // Sortiere Planeten: echte Namen zuerst (alphabetisch), dann _none
      const sortedPlanets = Object.keys(planets).sort((a, b) => {
        if (a === '_none') return 1
        if (b === '_none') return -1
        return a.localeCompare(b, 'de')
      })

      for (const planet of sortedPlanets) {
        const planetLocs = planets[planet]
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))

        for (const loc of planetLocs) {
          groups[displaySystem].push({
            id: loc.id,
            name: loc.name,
            label: planet === '_none' ? loc.name : `${planet} › ${loc.name}`,
          })
        }
      }
    })

    // Sortiere Systeme: bekannte zuerst, dann alphabetisch
    const sortedSystems = Object.keys(groups).sort((a, b) => {
      if (a === 'Sonstige') return 1
      if (b === 'Sonstige') return -1
      const aIdx = systemOrder.indexOf(a)
      const bIdx = systemOrder.indexOf(b)
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return a.localeCompare(b, 'de')
    })

    return { groups, sortedSystems }
  }, [locations])

  const { data: history } = useQuery<InventoryLog[]>({
    queryKey: ['inventory', 'history'],
    queryFn: () => apiClient.get('/api/inventory/history').then((r) => r.data),
    enabled: hasInventory && showHistory,
  })

  // Transfer Requests
  const { data: transferRequests } = useQuery<TransferRequest[]>({
    queryKey: ['transfer-requests'],
    queryFn: () => apiClient.get('/api/inventory/transfer-requests').then((r) => r.data),
    enabled: hasInventory,
  })

  const { data: pendingCount } = useQuery<PendingRequestsCount>({
    queryKey: ['transfer-requests', 'pending', 'count'],
    queryFn: () => apiClient.get('/api/inventory/transfer-requests/pending/count').then((r) => r.data),
    enabled: hasInventory,
    refetchInterval: 30000, // Alle 30 Sekunden aktualisieren
  })

  // Dashboard Query
  const { data: dashboard, isLoading: isDashboardLoading, error: dashboardError } = useQuery<InventoryDashboard>({
    queryKey: ['inventory', 'dashboard'],
    queryFn: () => apiClient.get('/api/inventory/dashboard').then((r) => r.data),
    enabled: showDashboard,
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

  // Item an anderen Ort verschieben
  const moveLocationMutation = useMutation({
    mutationFn: ({ itemId, toLocationId, quantity }: { itemId: number; toLocationId?: number | null; quantity?: number }) => {
      let url = `/api/inventory/${itemId}/move-location`
      const params = new URLSearchParams()
      if (toLocationId !== undefined && toLocationId !== null) params.append('to_location_id', toLocationId.toString())
      if (quantity) params.append('quantity', quantity.toString())
      const queryString = params.toString()
      return apiClient.post(queryString ? `${url}?${queryString}` : url)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setMoveModal(null)
      setMoveToLocation(null)
      setMoveQuantity(1)
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

  // Transfer Request Mutations
  const createRequestMutation = useMutation({
    mutationFn: (data: { owner_id: number; component_id: number; quantity: number; from_location_id?: number | null; notes?: string }) =>
      apiClient.post('/api/inventory/transfer-request', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
      setRequestModal(null)
      setRequestAmount(1)
      setRequestNotes('')
    },
  })

  const approveRequestMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.post(`/api/inventory/transfer-requests/${requestId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const rejectRequestMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      apiClient.post(`/api/inventory/transfer-requests/${requestId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
      setRejectModal(null)
      setRejectReason('')
    },
  })

  const confirmReceiptMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.post(`/api/inventory/transfer-requests/${requestId}/confirm-receipt`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const deliverMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.post(`/api/inventory/transfer-requests/${requestId}/deliver`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
    },
  })

  // Comment Mutation
  const updateCommentMutation = useMutation({
    mutationFn: (data: { requestId: number; pioneer_comment?: string | null; public_comment?: string | null }) =>
      apiClient.post(`/api/inventory/transfer-requests/${data.requestId}/comment`, {
        pioneer_comment: data.pioneer_comment,
        public_comment: data.public_comment
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] })
      setCommentModal(null)
      setPioneerComment('')
      setPublicComment('')
    },
  })

  // Order Number Search
  const searchOrders = async (term: string) => {
    if (!term.trim()) {
      setOrderSearchResults(null)
      return
    }
    setIsSearching(true)
    try {
      const response = await apiClient.get(`/api/inventory/transfer-requests/search?q=${encodeURIComponent(term)}`)
      setOrderSearchResults(response.data)
    } catch {
      setOrderSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (orderSearchTerm) {
        searchOrders(orderSearchTerm)
      } else {
        setOrderSearchResults(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearchTerm])

  // Component Search - "Wer hat was?"
  const searchComponents = async (term: string) => {
    if (!term.trim() || term.length < 2) {
      setComponentSearchResults(null)
      return
    }
    setIsSearchingComponents(true)
    try {
      const response = await apiClient.get(`/api/inventory/search-component?q=${encodeURIComponent(term)}`)
      setComponentSearchResults(response.data)
    } catch {
      setComponentSearchResults([])
    } finally {
      setIsSearchingComponents(false)
    }
  }

  // Debounced component search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (componentSearch && componentSearch.length >= 2) {
        searchComponents(componentSearch)
      } else {
        setComponentSearchResults(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [componentSearch])

  // Autocomplete Suggestions für "Wer hat was?" Suche
  const componentSearchSuggestions = useMemo<AutocompleteSuggestion[]>(() => {
    if (!componentSearchResults || componentSearchResults.length === 0) return []
    // Gruppiere nach Komponente (dedupliziert)
    const seen = new Set<number>()
    return componentSearchResults
      .filter(r => {
        if (seen.has(r.component.id)) return false
        seen.add(r.component.id)
        return true
      })
      .slice(0, 10)
      .map(r => ({
        id: r.component.id,
        label: r.component.name,
        sublabel: [r.component.manufacturer, r.component.category].filter(Boolean).join(' • ')
      }))
  }, [componentSearchResults])

  // Autocomplete Suggestions für Lager-Filter (basierend auf eigenem Inventar)
  const inventorySearchSuggestions = useMemo<AutocompleteSuggestion[]>(() => {
    if (!search || search.length < 2 || !myInventory) return []
    const searchLower = search.toLowerCase()
    const seen = new Set<number>()
    return myInventory
      .filter(item => {
        if (seen.has(item.component.id)) return false
        if (!item.component.name.toLowerCase().includes(searchLower)) return false
        seen.add(item.component.id)
        return true
      })
      .slice(0, 10)
      .map(item => ({
        id: item.component.id,
        label: item.component.name,
        sublabel: [item.component.manufacturer, item.component.category].filter(Boolean).join(' • ')
      }))
  }, [search, myInventory])

  // Hilfsfunktion zum Kopieren der Bestellnummer
  const copyOrderNumber = (orderNumber: string) => {
    navigator.clipboard.writeText(orderNumber)
  }

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

  // Sichtbare User basierend auf Rolle:
  // - Admin: alle
  // - Pioneer: alle (read-only)
  // - Normal: nur eigenes + Pioneers
  const visibleOfficers = useMemo(() => {
    if (!officers) return []

    if (isAdmin || isPioneer) {
      // Admins und Pioneers sehen alle
      return officers
    }

    // Normale User sehen nur eigenes und Pioneer-Lager
    return officers.filter(o =>
      o.id === user?.id || o.is_pioneer
    )
  }, [officers, isAdmin, isPioneer, user?.id])

  // Pending Requests für Badge
  const pendingAsOwner = (pendingCount?.as_owner_pending ?? 0) + (pendingCount?.as_owner_approved ?? 0) + (pendingCount?.as_owner_awaiting ?? 0)
  const pendingAsRequester = (pendingCount?.as_requester_pending ?? 0) + (pendingCount?.as_requester_approved ?? 0)
  const awaitingReceipt = pendingCount?.awaiting_receipt ?? 0
  const adminAwaiting = pendingCount?.admin_awaiting ?? 0
  const totalPendingBadge = pendingAsOwner + pendingAsRequester + awaitingReceipt + adminAwaiting

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Lager-Übersicht</h1>
        <div className="flex gap-2">
          {/* Buttons für alle User mit Lager-Zugang */}
          {hasInventory && (
            <>
              <button
                onClick={() => setShowTransferRequests(!showTransferRequests)}
                className={`btn ${showTransferRequests ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 relative`}
              >
                <Bell size={20} />
                Anfragen
                {totalPendingBadge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {totalPendingBadge}
                  </span>
                )}
              </button>
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
                className="btn bg-gray-600 hover:bg-gray-500 flex items-center gap-2"
                title="Nach einem Patch: Items abgleichen und neue Homelocation setzen"
              >
                <Package size={20} />
                Patch
              </button>
            </>
          )}
          {/* Buttons nur für Officers+ (aktive Verwaltung) */}
          {canManage && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Such- und Filterleiste */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <AutocompleteInput
            value={search}
            onChange={setSearch}
            suggestions={inventorySearchSuggestions}
            placeholder="Komponente suchen..."
            className="flex-1"
          />
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
            {groupedLocations.sortedSystems.map(system => (
              <optgroup key={system} label={`━━ ${system} ━━`}>
                {groupedLocations.groups[system].map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Komponenten-Suche & Dashboard Section */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Komponenten-Suche */}
          <AutocompleteInput
            value={componentSearch}
            onChange={setComponentSearch}
            suggestions={componentSearchSuggestions}
            isLoading={isSearchingComponents}
            placeholder="Wer hat was? (z.B. FR-76, Cooler...)"
            className="flex-1"
          />
          {/* Dashboard Toggle */}
          <button
            onClick={() => setShowDashboard(!showDashboard)}
            className={`btn ${showDashboard ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 whitespace-nowrap`}
          >
            <Package size={20} />
            {showDashboard ? 'Dashboard ausblenden' : 'Lager-Dashboard'}
          </button>
        </div>

        {/* Suchergebnisse */}
        {componentSearchResults !== null && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400">
                {componentSearchResults.length === 0
                  ? 'Keine Ergebnisse gefunden'
                  : `${componentSearchResults.length} Ergebnis${componentSearchResults.length !== 1 ? 'se' : ''} bei Pioneers`}
              </h3>
              <button
                onClick={() => {
                  setComponentSearch('')
                  setComponentSearchResults(null)
                }}
                className="text-xs text-gray-500 hover:text-primary"
              >
                Suche schließen
              </button>
            </div>
            {componentSearchResults.length > 0 && (
              <div className="space-y-2">
                {componentSearchResults.map((result) => (
                  <div
                    key={`${result.pioneer.id}-${result.component.id}-${result.location?.id ?? 'none'}`}
                    className="flex items-center justify-between p-3 bg-gray-800/50 border border-gray-600/30 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white">
                        {result.quantity}x {result.component.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-sm text-gray-400 mt-1">
                        <span className="text-krt-orange">{result.pioneer.display_name || result.pioneer.username}</span>
                        {result.location && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span className="flex items-center gap-1">
                              <MapPin size={12} />
                              {result.location.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Anfragen-Button (nur wenn nicht eigenes Lager) */}
                    {result.pioneer.id !== user?.id && (
                      <button
                        onClick={() => setRequestModal({
                          ownerId: result.pioneer.id,
                          ownerName: result.pioneer.display_name || result.pioneer.username,
                          component: result.component,
                          quantity: result.quantity,
                          locationId: result.location?.id ?? null
                        })}
                        className="btn btn-sm btn-primary flex items-center gap-1 ml-4"
                      >
                        <Send size={14} />
                        Anfragen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dashboard */}
        {showDashboard && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package size={20} className="text-krt-orange" />
                Pioneer-Lager Übersicht
              </h3>
              {dashboard && (
                <div className="text-sm text-gray-400">
                  {dashboard.total_quantity} Items bei {dashboard.total_pioneers} Pioneer{dashboard.total_pioneers !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            {isDashboardLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-gray-400">Dashboard wird geladen...</span>
              </div>
            )}
            {dashboardError && (
              <div className="p-4 bg-red-900/20 border border-red-700/30 rounded text-red-400">
                Fehler beim Laden des Dashboards. Bitte versuche es erneut.
              </div>
            )}
            {dashboard && dashboard.pioneers.length === 0 && (
              <div className="p-4 bg-gray-800/50 border border-gray-600/30 rounded text-gray-400 text-center">
                Keine Pioneer-Lager mit Bestand gefunden.
              </div>
            )}
            {dashboard && dashboard.pioneers.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {dashboard.pioneers.map((pioneer) => (
                <div
                  key={pioneer.pioneer.id}
                  className="p-4 bg-gray-800/50 border border-gray-600/30 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-3">
                    {pioneer.pioneer.avatar ? (
                      <img
                        src={pioneer.pioneer.avatar}
                        alt={pioneer.pioneer.display_name || pioneer.pioneer.username}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-krt-orange/20 flex items-center justify-center text-krt-orange font-bold">
                        {(pioneer.pioneer.display_name || pioneer.pioneer.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">
                        {pioneer.pioneer.display_name || pioneer.pioneer.username}
                      </p>
                      <p className="text-xs text-gray-400">
                        {pioneer.total_quantity} Items ({pioneer.total_items} verschiedene)
                      </p>
                    </div>
                  </div>
                  {/* Standorte */}
                  {pioneer.by_location.length > 0 && (
                    <div className="space-y-1 mt-3">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Standorte</p>
                      {pioneer.by_location.slice(0, 3).map((loc, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1 text-gray-400">
                            <MapPin size={12} />
                            {loc.location?.name || 'Ohne Standort'}
                          </span>
                          <span className="text-gray-300">{loc.total_quantity}</span>
                        </div>
                      ))}
                      {pioneer.by_location.length > 3 && (
                        <p className="text-xs text-gray-500 mt-1">
                          +{pioneer.by_location.length - 3} weitere Standorte
                        </p>
                      )}
                    </div>
                  )}
                  {/* Kategorien */}
                  {pioneer.by_category.length > 0 && (
                    <div className="space-y-1 mt-3 pt-3 border-t border-gray-700/50">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Top Kategorien</p>
                      {pioneer.by_category.slice(0, 3).map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">{cat.category}</span>
                          <span className="text-gray-300">{cat.total_quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Transfer Requests */}
      {showTransferRequests && hasInventory && (
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Bell size={24} className="text-krt-orange" />
              Transfer-Anfragen
            </h2>

            {/* Suchfeld für Bestellnummern */}
            <div className="relative">
              <input
                type="text"
                placeholder="Bestellnummer suchen (VPR-...)..."
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
                className="input w-full md:w-64 pl-10"
              />
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Suchergebnisse */}
          {orderSearchResults !== null && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-400">
                  Suchergebnisse: {orderSearchResults.length} Treffer
                </h3>
                <button
                  onClick={() => {
                    setOrderSearchTerm('')
                    setOrderSearchResults(null)
                  }}
                  className="text-xs text-gray-500 hover:text-primary"
                >
                  Suche schließen
                </button>
              </div>
              {orderSearchResults.length > 0 ? (
                <div className="space-y-3">
                  {orderSearchResults.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 bg-gray-800/50 border border-gray-600/30 rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Bestellnummer */}
                          {request.order_number && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-mono bg-krt-orange/20 px-3 py-1 rounded text-krt-orange font-bold">
                                {request.order_number}
                              </span>
                              <button
                                onClick={() => copyOrderNumber(request.order_number!)}
                                className="p-1 text-gray-400 hover:text-primary rounded"
                                title="Bestellnummer kopieren"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          )}
                          {/* Item & Menge */}
                          <p className="font-bold text-lg text-white">
                            {request.quantity}x {request.component.name}
                          </p>
                          {/* Wer → Wessen Lager */}
                          <div className="flex flex-wrap items-center gap-x-2 text-sm mt-1">
                            <span className="text-gray-400">Von:</span>
                            <span className="text-krt-orange">{request.requester.display_name || request.requester.username}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-gray-400">Aus Lager:</span>
                            <span className="text-gray-300">{request.owner.display_name || request.owner.username}</span>
                          </div>
                          {/* Status */}
                          <div className="mt-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              request.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' :
                              request.status === 'approved' ? 'bg-blue-900/50 text-blue-400' :
                              request.status === 'awaiting_receipt' ? 'bg-purple-900/50 text-purple-400' :
                              request.status === 'completed' ? 'bg-green-900/50 text-green-400' :
                              'bg-red-900/50 text-red-400'
                            }`}>
                              {request.status === 'pending' && 'Warte auf Freigabe'}
                              {request.status === 'approved' && 'Freigegeben'}
                              {request.status === 'awaiting_receipt' && 'Warte auf Empfang'}
                              {request.status === 'completed' && 'Abgeschlossen'}
                              {request.status === 'rejected' && 'Abgelehnt'}
                            </span>
                          </div>
                          {/* Öffentlicher Kommentar */}
                          {request.public_comment && (
                            <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-sm">
                              <span className="text-blue-400">Anmerkung: </span>
                              <span className="text-gray-200">{request.public_comment}</span>
                            </div>
                          )}
                          {/* Pioneer-Kommentar (nur für Pioneers/Admins) */}
                          {(isPioneer || isAdmin) && request.pioneer_comment && (
                            <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-sm">
                              <span className="text-yellow-400">Pioneer-Notiz: </span>
                              <span className="text-gray-200">{request.pioneer_comment}</span>
                            </div>
                          )}
                          {/* Datum */}
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(request.created_at).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        {/* Kommentar-Button für Pioneers */}
                        {(isPioneer || isAdmin) && (
                          <button
                            onClick={() => {
                              setCommentModal({
                                requestId: request.id,
                                orderNumber: request.order_number,
                                currentPioneerComment: request.pioneer_comment,
                                currentPublicComment: request.public_comment
                              })
                              setPioneerComment(request.pioneer_comment || '')
                              setPublicComment(request.public_comment || '')
                            }}
                            className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                            title="Kommentar bearbeiten"
                          >
                            <MessageCircle size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Keine Anfragen gefunden für "{orderSearchTerm}"</p>
              )}
            </div>
          )}

          {!orderSearchResults && (
            transferRequests && transferRequests.length > 0 ? (
            <div className="space-y-4">
              {/* 1. Neue Anfragen freigeben (PENDING → APPROVED) */}
              {transferRequests.filter(r =>
                r.status === 'pending' && (
                  r.owner.id === user?.id ||
                  (isPioneer && r.owner.is_pioneer && r.owner.id !== user?.id)
                )
              ).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-yellow-400 mb-2 border-b border-yellow-700/50 pb-1">
                    Neue Anfragen - Freigabe erforderlich
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r =>
                        r.status === 'pending' && (
                          r.owner.id === user?.id ||
                          (isPioneer && r.owner.is_pioneer && r.owner.id !== user?.id)
                        )
                      )
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-yellow-900/10 border border-yellow-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                                    {request.order_number}
                                  </span>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-lg text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* Wer → Wohin */}
                              <div className="flex flex-wrap items-center gap-x-2 text-sm mt-1">
                                <span className="text-gray-400">Angefragt von:</span>
                                <span className="text-krt-orange font-medium">{request.requester.display_name || request.requester.username}</span>
                                <span className="text-gray-500">|</span>
                                <span className="text-gray-400">Aus Lager:</span>
                                <span className="text-gray-300">{request.owner.display_name || request.owner.username}</span>
                              </div>
                              {/* Notizen/Begründung */}
                              {request.notes && (
                                <div className="mt-2 p-2 bg-gray-700/30 rounded text-sm">
                                  <span className="text-gray-500">Begründung: </span>
                                  <span className="text-gray-200 italic">"{request.notes}"</span>
                                </div>
                              )}
                              {/* Öffentlicher Kommentar */}
                              {request.public_comment && (
                                <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-sm">
                                  <span className="text-blue-400">Anmerkung: </span>
                                  <span className="text-gray-200">{request.public_comment}</span>
                                </div>
                              )}
                              {/* Pioneer-Kommentar (nur für Pioneers/Admins) */}
                              {(isPioneer || isAdmin) && request.pioneer_comment && (
                                <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-sm">
                                  <span className="text-yellow-400">Pioneer-Notiz: </span>
                                  <span className="text-gray-200">{request.pioneer_comment}</span>
                                </div>
                              )}
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Angefragt am {new Date(request.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} um {new Date(request.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 flex-shrink-0">
                              {/* Kommentar-Button für Pioneers */}
                              {(isPioneer || isAdmin) && (
                                <button
                                  onClick={() => {
                                    setCommentModal({
                                      requestId: request.id,
                                      orderNumber: request.order_number,
                                      currentPioneerComment: request.pioneer_comment,
                                      currentPublicComment: request.public_comment
                                    })
                                    setPioneerComment(request.pioneer_comment || '')
                                    setPublicComment(request.public_comment || '')
                                  }}
                                  className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                                  title="Kommentar bearbeiten"
                                >
                                  <MessageCircle size={18} />
                                </button>
                              )}
                              <div className="flex gap-2">
                              <button
                                onClick={() => setRejectModal({
                                  requestId: request.id,
                                  componentName: request.component.name,
                                  requesterName: request.requester.display_name || request.requester.username
                                })}
                                className="p-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"
                                title="Ablehnen"
                              >
                                <X size={18} />
                              </button>
                              <button
                                onClick={() => approveRequestMutation.mutate(request.id)}
                                disabled={approveRequestMutation.isPending}
                                className="btn btn-primary text-sm py-1.5 px-3"
                                title="Freigeben"
                              >
                                <Check size={16} className="mr-1" />
                                Freigeben
                              </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 2. Freigegebene Anfragen ausliefern (APPROVED → AWAITING_RECEIPT) - Pioneer-Seite */}
              {transferRequests.filter(r =>
                r.status === 'approved' && (
                  r.owner.id === user?.id ||
                  (isPioneer && r.owner.is_pioneer && r.owner.id !== user?.id)
                )
              ).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-blue-400 mb-2 border-b border-blue-700/50 pb-1 flex items-center gap-2">
                    <MessageCircle size={16} />
                    Freigegeben - Discord-Koordination & Ausliefern
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r =>
                        r.status === 'approved' && (
                          r.owner.id === user?.id ||
                          (isPioneer && r.owner.is_pioneer && r.owner.id !== user?.id)
                        )
                      )
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-blue-900/10 border border-blue-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer prominent */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-mono bg-blue-900/50 px-3 py-1 rounded text-blue-300 font-bold">
                                    {request.order_number}
                                  </span>
                                  <button
                                    onClick={() => copyOrderNumber(request.order_number!)}
                                    className="p-1 text-gray-400 hover:text-primary rounded"
                                    title="Bestellnummer kopieren"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-lg text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* An wen */}
                              <div className="flex flex-wrap items-center gap-x-2 text-sm mt-1">
                                <span className="text-gray-400">Übergabe an:</span>
                                <span className="text-krt-orange font-medium">{request.requester.display_name || request.requester.username}</span>
                                {request.requester.discord_id && (
                                  <span className="text-gray-500 text-xs">
                                    (Discord: @{request.requester.username})
                                  </span>
                                )}
                              </div>
                              {/* Öffentlicher Kommentar */}
                              {request.public_comment && (
                                <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-sm">
                                  <span className="text-blue-400">Anmerkung: </span>
                                  <span className="text-gray-200">{request.public_comment}</span>
                                </div>
                              )}
                              {/* Pioneer-Kommentar (nur für Pioneers/Admins) */}
                              {(isPioneer || isAdmin) && request.pioneer_comment && (
                                <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-sm">
                                  <span className="text-yellow-400">Pioneer-Notiz: </span>
                                  <span className="text-gray-200">{request.pioneer_comment}</span>
                                </div>
                              )}
                              {/* Discord Hinweis */}
                              <div className="mt-3 p-2 bg-blue-900/30 border border-blue-700/30 rounded text-sm">
                                <p className="text-blue-300 flex items-center gap-2">
                                  <MessageCircle size={14} />
                                  Vereinbare über Discord einen Übergabetermin
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Erwähne die Bestellnummer: <span className="font-mono text-blue-300">{request.order_number}</span>
                                </p>
                              </div>
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Freigegeben am {new Date(request.updated_at || request.created_at).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 flex-shrink-0">
                              {/* Kommentar-Button für Pioneers */}
                              {(isPioneer || isAdmin) && (
                                <button
                                  onClick={() => {
                                    setCommentModal({
                                      requestId: request.id,
                                      orderNumber: request.order_number,
                                      currentPioneerComment: request.pioneer_comment,
                                      currentPublicComment: request.public_comment
                                    })
                                    setPioneerComment(request.pioneer_comment || '')
                                    setPublicComment(request.public_comment || '')
                                  }}
                                  className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                                  title="Kommentar bearbeiten"
                                >
                                  <MessageCircle size={18} />
                                </button>
                              )}
                              <button
                                onClick={() => deliverMutation.mutate(request.id)}
                                disabled={deliverMutation.isPending}
                                className="btn bg-blue-600 hover:bg-blue-700 text-sm py-1.5 px-3 flex items-center gap-1"
                                title="Als ausgeliefert markieren"
                              >
                                <Truck size={16} />
                                Ausgeliefert
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 2b. Warte auf Empfängerbestätigung (als Pioneer/Owner) */}
              {transferRequests.filter(r => r.owner.id === user?.id && r.status === 'awaiting_receipt').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-yellow-400 mb-2 border-b border-yellow-700/50 pb-1">
                    ⏳ Warte auf Empfängerbestätigung
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r => r.owner.id === user?.id && r.status === 'awaiting_receipt')
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-yellow-900/10 border border-yellow-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-mono bg-yellow-900/50 px-2 py-0.5 rounded text-yellow-300">
                                    {request.order_number}
                                  </span>
                                  <button
                                    onClick={() => copyOrderNumber(request.order_number!)}
                                    className="text-yellow-400 hover:text-yellow-300"
                                    title="Bestellnummer kopieren"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-lg text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* An wen */}
                              <p className="text-sm text-gray-400 mt-1">
                                An: <span className="text-krt-orange font-medium">{request.requester.display_name || request.requester.username}</span>
                              </p>
                              {/* Öffentlicher Kommentar */}
                              {request.public_comment && (
                                <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-sm">
                                  <span className="text-blue-400">Anmerkung: </span>
                                  <span className="text-gray-200">{request.public_comment}</span>
                                </div>
                              )}
                              {/* Pioneer-Kommentar (nur für Pioneers/Admins) */}
                              {(isPioneer || isAdmin) && request.pioneer_comment && (
                                <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-sm">
                                  <span className="text-yellow-400">Pioneer-Notiz: </span>
                                  <span className="text-gray-200">{request.pioneer_comment}</span>
                                </div>
                              )}
                              {/* Status */}
                              <p className="text-sm text-yellow-400 mt-2">
                                Ausgeliefert - warte auf Bestätigung durch Empfänger
                              </p>
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Angefragt am {new Date(request.created_at).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 items-center">
                              {/* Kommentar-Button für Pioneers */}
                              {(isPioneer || isAdmin) && (
                                <button
                                  onClick={() => {
                                    setCommentModal({
                                      requestId: request.id,
                                      orderNumber: request.order_number,
                                      currentPioneerComment: request.pioneer_comment,
                                      currentPublicComment: request.public_comment
                                    })
                                    setPioneerComment(request.pioneer_comment || '')
                                    setPublicComment(request.public_comment || '')
                                  }}
                                  className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                                  title="Kommentar bearbeiten"
                                >
                                  <MessageCircle size={18} />
                                </button>
                              )}
                              <div className="text-yellow-400">
                                <Clock size={24} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 3. Erhalt bestätigen (als Empfänger) - WICHTIG! */}
              {transferRequests.filter(r => r.requester.id === user?.id && r.status === 'awaiting_receipt').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-green-400 mb-2 border-b border-green-700/50 pb-1">
                    ✓ Erhalt bestätigen - Items wurden übergeben
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r => r.requester.id === user?.id && r.status === 'awaiting_receipt')
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-green-900/10 border border-green-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-mono bg-green-900/50 px-2 py-0.5 rounded text-green-300">
                                    {request.order_number}
                                  </span>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-lg text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* Von wem */}
                              <p className="text-sm text-gray-400 mt-1">
                                Von: <span className="text-krt-orange font-medium">{request.owner.display_name || request.owner.username}</span>
                              </p>
                              {/* Öffentlicher Kommentar */}
                              {request.public_comment && (
                                <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/30 rounded text-sm">
                                  <span className="text-blue-400">Anmerkung vom Pioneer: </span>
                                  <span className="text-gray-200">{request.public_comment}</span>
                                </div>
                              )}
                              {/* Status */}
                              <p className="text-sm text-green-400 mt-2">
                                Pioneer hat ausgeliefert - bitte bestätige den Erhalt
                              </p>
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Angefragt am {new Date(request.created_at).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                            <button
                              onClick={() => confirmReceiptMutation.mutate(request.id)}
                              disabled={confirmReceiptMutation.isPending}
                              className="btn btn-primary text-sm py-1.5 px-3 flex-shrink-0"
                            >
                              {confirmReceiptMutation.isPending ? '...' : 'Erhalt bestätigen'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Admin: Erhalt für inaktive User bestätigen */}
              {isAdmin && transferRequests.filter(r => r.requester.id !== user?.id && r.status === 'awaiting_receipt').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2 border-b border-gray-700/50 pb-1">
                    Admin: Erhalt für andere bestätigen
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r => r.requester.id !== user?.id && r.status === 'awaiting_receipt')
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-gray-800/30 border border-krt-orange/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Item & Menge */}
                              <p className="font-bold text-lg text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* Wer → Wem */}
                              <div className="flex flex-wrap items-center gap-x-2 text-sm mt-1">
                                <span className="text-gray-400">Von:</span>
                                <span className="text-gray-300">{request.owner.display_name || request.owner.username}</span>
                                <span className="text-gray-500">→</span>
                                <span className="text-gray-400">An:</span>
                                <span className="text-krt-orange font-medium">{request.requester.display_name || request.requester.username}</span>
                              </div>
                              {/* Notizen */}
                              {request.notes && (
                                <div className="mt-2 p-2 bg-gray-700/30 rounded text-sm">
                                  <span className="text-gray-500">Begründung: </span>
                                  <span className="text-gray-200 italic">"{request.notes}"</span>
                                </div>
                              )}
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Angefragt am {new Date(request.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} um {new Date(request.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                              </p>
                            </div>
                            <button
                              onClick={() => confirmReceiptMutation.mutate(request.id)}
                              disabled={confirmReceiptMutation.isPending}
                              className="btn bg-krt-orange hover:bg-krt-orange-dark text-sm py-1.5 px-3 flex-shrink-0"
                            >
                              {confirmReceiptMutation.isPending ? '...' : 'Als Admin bestätigen'}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Meine Anfragen (als Anfragender) - warten auf Freigabe */}
              {transferRequests.filter(r => r.requester.id === user?.id && r.status === 'pending').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2 border-b border-gray-700/50 pb-1">
                    Meine Anfragen - Warten auf Freigabe
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r => r.requester.id === user?.id && r.status === 'pending')
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-gray-800/30 border border-gray-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                                    {request.order_number}
                                  </span>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* Bei wem */}
                              <p className="text-sm text-gray-400 mt-1">
                                Angefragt bei: <span className="text-krt-orange font-medium">{request.owner.display_name || request.owner.username}</span>
                              </p>
                              {/* Begründung */}
                              {request.notes && (
                                <div className="mt-2 p-2 bg-gray-700/30 rounded text-sm">
                                  <span className="text-gray-500">Begründung: </span>
                                  <span className="text-gray-200 italic">"{request.notes}"</span>
                                </div>
                              )}
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Angefragt am {new Date(request.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} um {new Date(request.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                              </p>
                            </div>
                            <span className="text-xs bg-yellow-600/20 text-yellow-300 px-2 py-1 rounded flex-shrink-0">
                              Wartet auf Freigabe
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Meine freigegebenen Anfragen - Discord Koordination läuft */}
              {transferRequests.filter(r => r.requester.id === user?.id && r.status === 'approved').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-blue-400 mb-2 border-b border-blue-700/50 pb-1 flex items-center gap-2">
                    <MessageCircle size={16} />
                    Freigegeben - Warte auf Übergabe
                  </h3>
                  <div className="space-y-3">
                    {transferRequests
                      .filter(r => r.requester.id === user?.id && r.status === 'approved')
                      .map((request) => (
                        <div
                          key={request.id}
                          className="p-4 bg-blue-900/10 border border-blue-600/30 rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer prominent */}
                              {request.order_number && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-mono bg-blue-900/50 px-3 py-1 rounded text-blue-300 font-bold">
                                    {request.order_number}
                                  </span>
                                  <button
                                    onClick={() => copyOrderNumber(request.order_number!)}
                                    className="p-1 text-gray-400 hover:text-primary rounded"
                                    title="Bestellnummer kopieren"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              )}
                              {/* Item & Menge */}
                              <p className="font-bold text-white">
                                {request.quantity}x {request.component.name}
                              </p>
                              {/* Von wem */}
                              <p className="text-sm text-gray-400 mt-1">
                                Pioneer: <span className="text-krt-orange font-medium">{request.owner.display_name || request.owner.username}</span>
                              </p>
                              {/* Discord Hinweis */}
                              <div className="mt-3 p-2 bg-blue-900/30 border border-blue-700/30 rounded text-sm">
                                <p className="text-blue-300 flex items-center gap-2">
                                  <MessageCircle size={14} />
                                  Kontaktiere den Pioneer über Discord für einen Übergabetermin
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Bestellnummer: <span className="font-mono text-blue-300">{request.order_number}</span>
                                </p>
                              </div>
                              {/* Datum */}
                              <p className="text-xs text-gray-500 mt-2">
                                Freigegeben am {new Date(request.updated_at || request.created_at).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                            <span className="text-xs bg-blue-600/20 text-blue-300 px-2 py-1 rounded flex-shrink-0">
                              Discord-Koordination
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Abgeschlossene Anfragen */}
              {transferRequests.filter(r => r.status === 'completed' || r.status === 'rejected').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2 border-b border-gray-700/50 pb-1">
                    Vergangene Anfragen
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transferRequests
                      .filter(r => r.status === 'completed' || r.status === 'rejected')
                      .slice(0, 15)
                      .map((request) => (
                        <div
                          key={request.id}
                          className={`p-3 rounded-lg ${
                            request.status === 'completed' ? 'bg-gray-800/30 border border-gray-600/30' : 'bg-red-900/10 border border-red-600/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Bestellnummer */}
                              {request.order_number && (
                                <span className="text-xs font-mono bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-400 mr-2">
                                  {request.order_number}
                                </span>
                              )}
                              <p className="font-medium text-sm inline">
                                {request.quantity}x {request.component.name}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {request.requester.display_name || request.requester.username}
                                {' ← '}
                                {request.owner.display_name || request.owner.username}
                              </p>
                              {request.notes && (
                                <p className="text-xs text-gray-500 mt-1 truncate" title={request.notes}>
                                  "{request.notes}"
                                </p>
                              )}
                              {/* Ablehnungsgrund anzeigen */}
                              {request.status === 'rejected' && request.rejection_reason && (
                                <div className="mt-2 p-2 bg-red-900/20 border border-red-700/30 rounded">
                                  <p className="text-xs text-red-400 font-medium">Ablehnungsgrund:</p>
                                  <p className="text-sm text-gray-200 italic">"{request.rejection_reason}"</p>
                                </div>
                              )}
                              <p className="text-xs text-gray-600 mt-1">
                                {new Date(request.created_at).toLocaleDateString('de-DE')}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded flex-shrink-0 ${
                              request.status === 'completed' ? 'bg-gray-600/30 text-gray-200' : 'bg-red-600/30 text-red-300'
                            }`}>
                              {request.status === 'completed' ? 'Abgeschlossen' : 'Abgelehnt'}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Keine offenen Anfragen */}
              {transferRequests.filter(r => r.status === 'pending' || r.status === 'approved' || r.status === 'awaiting_receipt').length === 0 && (
                <p className="text-gray-400 text-center py-4">Keine offenen Anfragen.</p>
              )}
            </div>
          ) : (
            <p className="text-gray-400">Noch keine Transfer-Anfragen vorhanden.</p>
          )
          )}
        </div>
      )}

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
      {hasInventory && (
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
                                        {canManage ? (
                                          <>
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
                                                setMoveModal({
                                                  itemId: item.id,
                                                  componentName: item.component.name,
                                                  quantity: item.quantity,
                                                  currentLocationId: item.location?.id ?? null,
                                                  currentLocationName: item.location?.name ?? 'Ohne Standort',
                                                })
                                              }
                                              className="p-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                                              title="Standort ändern"
                                            >
                                              <MapPin size={14} />
                                            </button>
                                            <button
                                              onClick={() =>
                                                setTransferModal({
                                                  component: item.component,
                                                  quantity: item.quantity,
                                                  locationId: item.location?.id ?? null,
                                                })
                                              }
                                              className="p-1.5 bg-krt-orange/20 text-krt-orange rounded hover:bg-krt-orange/30"
                                              title="An andere Person transferieren"
                                            >
                                              <ArrowRight size={14} />
                                            </button>
                                          </>
                                        ) : (
                                          <span className="w-10 text-center font-bold">
                                            {item.quantity}
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
        <h2 className="text-xl font-bold mb-4">
          {isAdmin ? 'Alle Lager' : isPioneer ? 'Lager-Übersicht (nur Ansicht)' : 'Sichtbare Lager'}
        </h2>
        {!isAdmin && !isPioneer && (
          <p className="text-sm text-gray-400 mb-4">
            Du siehst dein eigenes Lager und die Lager der Pioneers. Um Items von anderen anzufordern, klicke auf "Anfragen".
          </p>
        )}
        {visibleOfficers && inventoryByUser ? (
          <div className="space-y-3">
            {visibleOfficers.map((officer) => {
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
                        {officer.is_pioneer && (
                          <span className="text-xs bg-gray-600/30 text-gray-300 px-1.5 py-0.5 rounded ml-2">Pioneer</span>
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
                                .map((item) => {
                                  const isOwnInventory = officer.id === user?.id
                                  // Jeder kann Items anfragen (außer Admins, die bearbeiten direkt)
                                  const canRequestFrom = !isOwnInventory && !isAdmin && !!user

                                  return (
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
                                          <div className="flex items-center gap-2">
                                            <p className="text-krt-orange font-medium">{item.quantity}x</p>
                                            {canRequestFrom && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setRequestModal({
                                                    ownerId: officer.id,
                                                    ownerName: officer.display_name || officer.username,
                                                    component: item.component,
                                                    quantity: item.quantity,
                                                    locationId: item.location?.id ?? null,
                                                  })
                                                  setRequestAmount(1)
                                                }}
                                                className="p-1 bg-gray-600/20 text-gray-400 rounded hover:bg-gray-600/30"
                                                title="Anfragen"
                                              >
                                                <Send size={12} />
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {item.location && (
                                          <span className="flex items-center gap-1 text-xs text-gray-400">
                                            <MapPin size={10} />
                                            {item.location.name}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
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
                    <label className="label">Ziel-Standort *</label>
                    <select
                      value={transferToLocation ?? ''}
                      onChange={(e) => setTransferToLocation(e.target.value ? Number(e.target.value) : null)}
                      className={`input ${!transferToLocation ? 'border-krt-orange' : ''}`}
                    >
                      <option value="">-- Standort wählen * --</option>
                      {groupedLocations.sortedSystems.map(system => (
                        <optgroup key={system} label={`━━ ${system} ━━`}>
                          {groupedLocations.groups[system].map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {!transferToLocation && (
                      <p className="text-xs text-krt-orange mt-1">Bitte wähle einen Ziel-Standort</p>
                    )}
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
                      disabled={!transferTo || !transferToLocation}
                      className="btn btn-primary flex-1"
                    >
                      {!transferToLocation ? 'Standort wählen' : 'Weiter'}
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
                    className="btn bg-krt-orange hover:bg-krt-orange-dark flex-1"
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
          groupedLocations={groupedLocations}
          onSelect={(componentId, quantity, locationId) => {
            addMutation.mutate({ componentId, quantity, locationId })
          }}
          onClose={() => {
            setAddModal(false)
            setQuickAddCount(0) // Reset Zähler beim Schließen
          }}
          isPending={addMutation.isPending}
          quickAddMode={quickAddMode}
          setQuickAddMode={setQuickAddMode}
          quickAddCount={quickAddCount}
          lastLocationId={lastLocationId}
          onSuccessfulAdd={(locId, _name, _qty) => {
            setLastLocationId(locId) // Letzten Standort merken
            setQuickAddCount(prev => prev + 1) // Zähler erhöhen
          }}
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
                  {groupedLocations.sortedSystems.map(system => (
                    <optgroup key={system} label={`━━ ${system} ━━`}>
                      {groupedLocations.groups[system].map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.label}
                        </option>
                      ))}
                    </optgroup>
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
                  {groupedLocations.sortedSystems.map(system => (
                    <optgroup key={system} label={`━━ ${system} ━━`}>
                      {groupedLocations.groups[system].map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.label}
                        </option>
                      ))}
                    </optgroup>
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

      {/* Single Item Move Modal */}
      {moveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MapPin size={24} className="text-krt-orange" />
              Standort ändern
            </h2>
            <p className="text-gray-400 mb-4">
              Verschiebe <span className="text-white font-medium">{moveModal.componentName}</span> an einen anderen Standort.
            </p>

            <div className="space-y-4">
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-sm text-gray-400">Aktueller Standort:</p>
                <p className="font-medium">{moveModal.currentLocationName}</p>
                <p className="text-sm text-gray-400 mt-1">Verfügbar: {moveModal.quantity}x</p>
              </div>

              <div>
                <label className="label">Menge verschieben</label>
                <input
                  type="number"
                  min={1}
                  max={moveModal.quantity}
                  value={moveQuantity}
                  onChange={(e) => setMoveQuantity(Math.min(moveModal.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Neuer Standort *</label>
                <select
                  value={moveToLocation === null ? '' : moveToLocation}
                  onChange={(e) => setMoveToLocation(e.target.value === '' ? null : Number(e.target.value))}
                  className="input"
                >
                  <option value="">-- Neuen Standort wählen --</option>
                  {groupedLocations.sortedSystems.map(system => {
                    const filteredLocs = groupedLocations.groups[system].filter(loc => loc.id !== moveModal.currentLocationId)
                    if (filteredLocs.length === 0) return null
                    return (
                      <optgroup key={system} label={`━━ ${system} ━━`}>
                        {filteredLocs.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.label}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setMoveModal(null)
                    setMoveToLocation(null)
                    setMoveQuantity(1)
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    moveLocationMutation.mutate({
                      itemId: moveModal.itemId,
                      toLocationId: moveToLocation,
                      quantity: moveQuantity < moveModal.quantity ? moveQuantity : undefined,
                    })
                  }}
                  disabled={!moveToLocation || moveLocationMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {moveLocationMutation.isPending ? 'Wird verschoben...' : 'Verschieben'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Request Modal */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Send size={24} className="text-gray-400" />
              Item anfragen
            </h2>

            <div className="p-4 bg-gray-800/50 rounded-lg mb-4">
              <p className="text-sm text-gray-400 mb-1">Von:</p>
              <p className="font-medium text-krt-orange">{requestModal.ownerName}</p>
              <p className="text-sm text-gray-400 mt-2 mb-1">Item:</p>
              <p className="font-bold">{requestModal.component.name}</p>
              <p className="text-sm text-gray-500">Verfügbar: {requestModal.quantity}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Gewünschte Menge</label>
                <input
                  type="number"
                  min={1}
                  max={requestModal.quantity}
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(Math.min(Number(e.target.value), requestModal.quantity))}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Notiz (optional)</label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Warum brauchst du das Item?"
                  className="input resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRequestModal(null)
                    setRequestAmount(1)
                    setRequestNotes('')
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    createRequestMutation.mutate({
                      owner_id: requestModal.ownerId,
                      component_id: requestModal.component.id,
                      quantity: requestAmount,
                      from_location_id: requestModal.locationId,
                      notes: requestNotes || undefined,
                    })
                  }}
                  disabled={createRequestMutation.isPending || requestAmount < 1}
                  className="btn btn-primary flex-1"
                >
                  {createRequestMutation.isPending ? 'Wird gesendet...' : 'Anfrage senden'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-400">
              <X size={24} />
              Anfrage ablehnen
            </h2>

            <div className="p-4 bg-gray-800/50 rounded-lg mb-4">
              <p className="text-sm text-gray-400 mb-1">Anfrage von:</p>
              <p className="font-medium text-krt-orange">{rejectModal.requesterName}</p>
              <p className="text-sm text-gray-400 mt-2 mb-1">Item:</p>
              <p className="font-bold">{rejectModal.componentName}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">
                  Begründung <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Warum lehnst du die Anfrage ab?"
                  className="input resize-none"
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Der Anfragende sieht diese Begründung.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRejectModal(null)
                    setRejectReason('')
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    rejectRequestMutation.mutate({
                      requestId: rejectModal.requestId,
                      reason: rejectReason
                    })
                  }}
                  disabled={rejectRequestMutation.isPending || !rejectReason.trim()}
                  className="btn bg-red-600 hover:bg-red-700 text-white flex-1"
                >
                  {rejectRequestMutation.isPending ? 'Wird abgelehnt...' : 'Ablehnen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal (für Pioneers) */}
      {commentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageCircle size={24} className="text-krt-orange" />
              Kommentar bearbeiten
            </h2>

            {commentModal.orderNumber && (
              <div className="mb-4">
                <span className="text-sm font-mono bg-gray-700 px-2 py-1 rounded text-gray-300">
                  {commentModal.orderNumber}
                </span>
              </div>
            )}

            <div className="space-y-4">
              {/* Öffentlicher Kommentar */}
              <div>
                <label className="label">
                  Öffentlicher Kommentar
                  <span className="text-xs text-gray-500 ml-2">(sichtbar für den Bestellenden)</span>
                </label>
                <textarea
                  value={publicComment}
                  onChange={(e) => setPublicComment(e.target.value)}
                  placeholder="Anmerkung zur Bestellung..."
                  className="input resize-none"
                  rows={2}
                />
              </div>

              {/* Pioneer-Kommentar */}
              <div>
                <label className="label">
                  Pioneer-Notiz
                  <span className="text-xs text-yellow-500 ml-2">(nur für Pioneers sichtbar)</span>
                </label>
                <textarea
                  value={pioneerComment}
                  onChange={(e) => setPioneerComment(e.target.value)}
                  placeholder="Interne Notiz für Pioneers..."
                  className="input resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCommentModal(null)
                    setPioneerComment('')
                    setPublicComment('')
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    updateCommentMutation.mutate({
                      requestId: commentModal.requestId,
                      pioneer_comment: pioneerComment || null,
                      public_comment: publicComment || null
                    })
                  }}
                  disabled={updateCommentMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {updateCommentMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
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
              <Package size={24} className="text-gray-400" />
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
                  {groupedLocations.sortedSystems.map(system => (
                    <optgroup key={system} label={`━━ ${system} ━━`}>
                      {groupedLocations.groups[system].map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.label}
                        </option>
                      ))}
                    </optgroup>
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
                                patchKeptItems.has(item.id) ? 'bg-gray-800/30' : 'bg-red-900/10'
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
                  <span className="text-gray-300">
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
                  className="btn bg-gray-600 hover:bg-gray-500 flex-1"
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
  groupedLocations: { groups: Record<string, { id: number; name: string; label: string }[]>; sortedSystems: string[] }
  onSelect: (componentId: number, quantity: number, locationId: number | null) => void
  onClose: () => void
  isPending: boolean
  // Quick-Add Modus
  quickAddMode: boolean
  setQuickAddMode: (value: boolean) => void
  quickAddCount: number
  lastLocationId: number | null
  onSuccessfulAdd: (locationId: number | null, componentName: string, quantity: number) => void
}

function ComponentSelectModal({
  components,
  myInventory,
  categories,
  manufacturers,
  groupedLocations,
  onSelect,
  onClose,
  isPending,
  quickAddMode,
  setQuickAddMode,
  quickAddCount,
  lastLocationId,
  onSuccessfulAdd,
}: ComponentSelectModalProps) {
  const [modalSearch, setModalSearch] = useState('')
  const [modalCategory, setModalCategory] = useState('')
  const [modalManufacturer, setModalManufacturer] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [locationId, setLocationId] = useState<number | null>(lastLocationId)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-600/50 rounded-lg text-green-400 flex items-center gap-2">
            <Check size={18} />
            {successMessage}
          </div>
        )}

        {/* Menge und Standort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
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
              {groupedLocations.sortedSystems.map(system => (
                <optgroup key={system} label={`━━ ${system} ━━`}>
                  {groupedLocations.groups[system].map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Quick-Add Checkbox */}
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={quickAddMode}
            onChange={(e) => setQuickAddMode(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800"
          />
          Quick-Add Modus (Modal offen lassen)
          {quickAddCount > 0 && (
            <span className="ml-auto text-krt-orange">{quickAddCount} hinzugefügt</span>
          )}
        </label>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            {quickAddMode && quickAddCount > 0 ? 'Fertig' : 'Abbrechen'}
          </button>
          <button
            onClick={() => {
              if (selectedId && selectedComponent) {
                onSelect(selectedId, quantity, locationId)
                if (quickAddMode) {
                  // Quick-Add: Felder resetten, Modal offen lassen
                  onSuccessfulAdd(locationId, selectedComponent.name, quantity)
                  setSuccessMessage(`${quantity}x ${selectedComponent.name} hinzugefügt`)
                  setSelectedId(null)
                  setQuantity(1)
                  setModalSearch('')
                  // Standort NICHT resetten - der bleibt!
                  setTimeout(() => setSuccessMessage(null), 3000)
                } else {
                  // Normal: Modal schließen
                  onClose()
                }
              }
            }}
            disabled={!selectedId || isPending}
            className="btn btn-primary flex-1"
          >
            {isPending ? 'Wird hinzugefügt...' : quickAddMode ? 'Hinzufügen & Weiter' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
