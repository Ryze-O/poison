import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import {
  Search,
  Shield,
  Zap,
  Thermometer,
  Rocket,
  X,
  Info,
  ChevronRight,
  RefreshCw,
  MapPin,
  Package,
} from 'lucide-react'
import type { Component, ComponentDetail, ItemPrice, UEXSyncStats, InventoryItem, User } from '../api/types'

// Formatiert aUEC Preise
const formatPrice = (price: number | null): string => {
  if (price === null || price === 0) return '-'
  return price.toLocaleString('de-DE') + ' aUEC'
}


// Class-Farben (minimalistisch mit Grautönen)
const classColors: Record<string, string> = {
  Military: 'text-krt-orange bg-krt-orange/10 border-krt-orange/30',
  Industrial: 'text-gray-300 bg-gray-800/50 border-gray-600',
  Civilian: 'text-gray-400 bg-gray-800/30 border-gray-700',
  Stealth: 'text-gray-300 bg-gray-800/50 border-gray-600',
  Competition: 'text-white bg-gray-700/50 border-gray-500',
}

// Grade-Farben (minimalistisch)
const gradeColors: Record<string, string> = {
  A: 'text-white',
  B: 'text-gray-300',
  C: 'text-gray-400',
  D: 'text-gray-500',
}

export default function ComponentBrowserPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [subCategoryFilter, setSubCategoryFilter] = useState('')

  // URL-Parameter synchronisieren
  useEffect(() => {
    const urlSearch = searchParams.get('search')
    if (urlSearch && urlSearch !== search) {
      setSearch(urlSearch)
    }
  }, [searchParams])

  // Admin check für UEX Sync
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const isAdmin = effectiveRole === 'admin'

  // Suche nach Komponenten (mit optionalem Kategorie-Filter)
  // Aktiviert wenn: mindestens 2 Zeichen ODER Kategorie ausgewählt
  const hasSearchText = search.length >= 2
  const hasSearchCriteria = hasSearchText || !!categoryFilter
  const { data: searchResults, isLoading: isSearching } = useQuery<Component[]>({
    queryKey: ['component-search', search, categoryFilter, subCategoryFilter],
    queryFn: () => {
      // Wenn Suchtext vorhanden: /search Endpoint nutzen (Fuzzy-Matching)
      // Sonst: /items Endpoint mit Kategorie-Filter
      if (hasSearchText) {
        let url = `/api/items/search?q=${encodeURIComponent(search)}`
        if (categoryFilter) url += `&category=${encodeURIComponent(categoryFilter)}`
        return apiClient.get(url).then(r => r.data)
      } else {
        // Nur Kategorie-Filter, keine Suche - nutze /items Endpoint
        let url = `/api/items?category=${encodeURIComponent(categoryFilter)}`
        if (subCategoryFilter) url += `&sub_category=${encodeURIComponent(subCategoryFilter)}`
        return apiClient.get(url).then(r => r.data)
      }
    },
    enabled: hasSearchCriteria,
  })

  // Alle Kategorien laden
  const { data: categories } = useQuery<string[]>({
    queryKey: ['items', 'categories'],
    queryFn: () => apiClient.get('/api/items/categories').then(r => r.data),
  })

  // Sub-Kategorien für gewählte Kategorie
  const { data: subCategories } = useQuery<string[]>({
    queryKey: ['items', 'sub-categories', categoryFilter],
    queryFn: () => {
      let url = '/api/items/sub-categories'
      if (categoryFilter) url += `?category=${encodeURIComponent(categoryFilter)}`
      return apiClient.get(url).then(r => r.data)
    },
  })

  // Detail-Daten für ausgewählte Komponente
  const { data: componentDetail, isLoading: isLoadingDetail } = useQuery<ComponentDetail>({
    queryKey: ['component-detail', selectedComponent?.id],
    queryFn: () => apiClient.get(`/api/items/${selectedComponent!.id}/details`).then(r => r.data),
    enabled: !!selectedComponent,
  })

  // UEX Preise für ausgewählte Komponente
  const { data: componentPrices, isLoading: isPricesLoading } = useQuery<ItemPrice[]>({
    queryKey: ['component-prices', selectedComponent?.id],
    queryFn: () => apiClient.get(`/api/sc/items/${selectedComponent!.id}/prices`).then(r => r.data),
    enabled: !!selectedComponent,
  })

  // UEX Sync Status
  const { data: uexStats } = useQuery<UEXSyncStats>({
    queryKey: ['uex', 'stats'],
    queryFn: () => apiClient.get('/api/sc/uex/stats').then(r => r.data),
    retry: false,
  })

  // Alle Inventare laden (für Pioneer-Check)
  const { data: allInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', 'all'],
    queryFn: () => apiClient.get('/api/inventory').then(r => r.data),
  })

  // Officers/Pioneers laden
  const { data: officers } = useQuery<User[]>({
    queryKey: ['officers'],
    queryFn: () => apiClient.get('/api/users/officers').then(r => r.data),
  })

  // Prüfen welche Pioneers dieses Item haben
  const pioneersWithItem = selectedComponent && allInventory && officers
    ? officers
        .filter(o => o.is_pioneer)
        .map(pioneer => {
          const pioneerItems = allInventory.filter(
            inv => inv.user_id === pioneer.id && inv.component.id === selectedComponent.id
          )
          const totalQty = pioneerItems.reduce((sum, i) => sum + i.quantity, 0)
          return totalQty > 0 ? { pioneer, quantity: totalQty } : null
        })
        .filter(Boolean) as { pioneer: User; quantity: number }[]
    : []

  // UEX Sync Mutation
  const syncUEXMutation = useMutation({
    mutationFn: () => apiClient.post('/api/sc/uex/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uex', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['component-prices'] })
    },
  })

  // Gefilterte Ergebnisse (Sub-Kategorie wird clientseitig gefiltert)
  const filteredResults = searchResults?.filter(c => {
    if (subCategoryFilter && c.sub_category !== subCategoryFilter) return false
    return true
  })

  // Formatierung für große Zahlen
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-'
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toFixed(1)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Item Search</h1>
          <p className="text-gray-400">
            Durchsuche alle Star Citizen Items nach Name, Hersteller oder Typ.
          </p>
          {uexStats && uexStats.status === 'completed' && (
            <p className="text-sm text-gray-500 mt-1">
              {uexStats.items_matched.toLocaleString()} Items mit Preisdaten
              {uexStats.finished_at && ` • Sync: ${new Date(uexStats.finished_at).toLocaleDateString('de-DE')}`}
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => syncUEXMutation.mutate()}
            disabled={syncUEXMutation.isPending}
            className="btn btn-secondary flex items-center gap-2"
            title="Preise von UEX API synchronisieren"
          >
            <RefreshCw size={20} className={syncUEXMutation.isPending ? 'animate-spin' : ''} />
            {syncUEXMutation.isPending ? 'Sync läuft...' : 'UEX Sync'}
          </button>
        )}
      </div>

      {/* Sync Status Meldung */}
      {syncUEXMutation.isSuccess && (
        <div className="card mb-6 bg-gray-800/30 border-gray-600/50">
          <p className="text-gray-300">
            UEX Sync erfolgreich!
          </p>
        </div>
      )}
      {syncUEXMutation.isError && (
        <div className="card mb-6 bg-red-900/30 border-red-600/50">
          <p className="text-red-400">Fehler beim UEX Sync. Bitte später erneut versuchen.</p>
        </div>
      )}

      {/* Such-Bereich */}
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
              placeholder='Suche nach Item (z.B. "FR-76", "Sukoran", "P4-AR")...'
              className="input pl-10"
              autoFocus
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setSubCategoryFilter('')  // Reset sub-filter wenn Kategorie wechselt
            }}
            className="input md:w-48"
          >
            <option value="">Alle Kategorien</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={subCategoryFilter}
            onChange={(e) => setSubCategoryFilter(e.target.value)}
            className="input md:w-48"
          >
            <option value="">Alle Typen</option>
            {subCategories?.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Fuzzy-Suche: "TS2" findet auch "TS-2" | Min. 2 Zeichen oder Kategorie wählen
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Suchergebnisse */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Search size={18} />
            Ergebnisse
            {filteredResults && <span className="text-gray-500 font-normal">({filteredResults.length})</span>}
          </h2>

          {!hasSearchCriteria ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Gib mindestens 2 Zeichen ein oder wähle eine Kategorie.</p>
            </div>
          ) : isSearching ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Suche...</p>
            </div>
          ) : filteredResults && filteredResults.length > 0 ? (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredResults.map((comp) => {
                // Prüfen ob ein Pioneer dieses Item hat
                const hasPioneerStock = allInventory && officers
                  ? officers
                      .filter(o => o.is_pioneer)
                      .some(pioneer =>
                        allInventory.some(inv => inv.user_id === pioneer.id && inv.component.id === comp.id && inv.quantity > 0)
                      )
                  : false

                return (
                  <button
                    key={comp.id}
                    onClick={() => setSelectedComponent(comp)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedComponent?.id === comp.id
                        ? 'bg-krt-orange/20 border-krt-orange'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium flex items-center gap-2">
                          {comp.name}
                          {hasPioneerStock && (
                            <span className="inline-flex items-center gap-1 text-xs bg-krt-orange/20 text-krt-orange px-1.5 py-0.5 rounded" title="Im Pioneer-Lager verfügbar">
                              <Package size={10} />
                              Lager
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {comp.manufacturer && <span>{comp.manufacturer} · </span>}
                          {comp.sub_category}
                          {comp.size && <span> · S{comp.size}</span>}
                        </p>
                        {/* Ref-Code */}
                        {comp.class_name && (
                          <p className="text-xs text-gray-600 font-mono truncate">{comp.class_name}</p>
                        )}
                      </div>
                      <ChevronRight size={18} className="text-gray-500 flex-shrink-0" />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-gray-400">Keine Komponenten gefunden.</p>
            </div>
          )}
        </div>

        {/* Detail-Ansicht */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Info size={18} />
            Details
          </h2>

          {!selectedComponent ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Wähle eine Komponente aus der Liste.</p>
            </div>
          ) : isLoadingDetail ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Lade Details...</p>
            </div>
          ) : componentDetail ? (
            <div className="card">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold">{componentDetail.name}</h3>
                  <p className="text-gray-400">
                    {componentDetail.manufacturer || 'Unbekannter Hersteller'}
                  </p>
                  {/* Ref-Code (class_name) */}
                  {componentDetail.raw_stats?.class_name && (
                    <p className="text-xs text-gray-500 font-mono mt-1">
                      {componentDetail.raw_stats.class_name as string}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedComponent(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Basis-Info */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {/* Size */}
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <p className="text-xs text-gray-500 mb-1">Size</p>
                  <p className="text-xl font-bold">{componentDetail.size ?? '-'}</p>
                </div>

                {/* Grade */}
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <p className="text-xs text-gray-500 mb-1">Grade</p>
                  <p className={`text-xl font-bold ${gradeColors[componentDetail.grade || ''] || ''}`}>
                    {componentDetail.grade ?? '-'}
                  </p>
                </div>

                {/* Class */}
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <p className="text-xs text-gray-500 mb-1">Class</p>
                  {componentDetail.item_class ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium border ${classColors[componentDetail.item_class] || 'text-gray-400'}`}>
                      {componentDetail.item_class}
                    </span>
                  ) : (
                    <p className="text-xl font-bold">-</p>
                  )}
                </div>
              </div>

              {/* Beschreibung */}
              {componentDetail.description && (
                <div className="mb-4 p-3 bg-gray-800/30 rounded-lg">
                  <p className="text-sm text-gray-300">{componentDetail.description}</p>
                </div>
              )}

              {/* Shield Stats */}
              {componentDetail.shield && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-krt-orange mb-2 flex items-center gap-2">
                    <Shield size={16} />
                    Shield Stats
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Max Health</p>
                      <p className="font-medium">{formatNumber(componentDetail.shield.max_shield_health)} HP</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Regen Rate</p>
                      <p className="font-medium">{formatNumber(componentDetail.shield.max_shield_regen)} HP/s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Downed Delay</p>
                      <p className="font-medium">{componentDetail.shield.downed_delay?.toFixed(1) ?? '-'}s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Damage Delay</p>
                      <p className="font-medium">{componentDetail.shield.damage_delay?.toFixed(1) ?? '-'}s</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Power Stats */}
              {componentDetail.power && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Zap size={16} />
                    Power Stats
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Power Draw</p>
                      <p className="font-medium">{formatNumber(componentDetail.power.power_draw)} pwr/s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Base Power</p>
                      <p className="font-medium">{formatNumber(componentDetail.power.power_base)}</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">EM Signature (Min)</p>
                      <p className="font-medium">{formatNumber(componentDetail.power.em_min)}</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">EM Signature (Max)</p>
                      <p className="font-medium">{formatNumber(componentDetail.power.em_max)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Cooler Stats */}
              {componentDetail.cooler && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-cyan-400 mb-2 flex items-center gap-2">
                    <Thermometer size={16} />
                    Cooler Stats
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Cooling Rate</p>
                      <p className="font-medium">{formatNumber(componentDetail.cooler.cooling_rate)}</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">IR Suppression</p>
                      <p className="font-medium">{componentDetail.cooler.suppression_ir_factor?.toFixed(2) ?? '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Quantum Drive Stats */}
              {componentDetail.quantum_drive && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Rocket size={16} />
                    Quantum Drive Stats
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Speed</p>
                      <p className="font-medium">{formatNumber(componentDetail.quantum_drive.quantum_speed)} m/s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Spool Time</p>
                      <p className="font-medium">{componentDetail.quantum_drive.quantum_spool_time?.toFixed(1) ?? '-'}s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Cooldown</p>
                      <p className="font-medium">{componentDetail.quantum_drive.quantum_cooldown_time?.toFixed(1) ?? '-'}s</p>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded">
                      <p className="text-xs text-gray-500">Fuel Rate</p>
                      <p className="font-medium">{componentDetail.quantum_drive.quantum_fuel_requirement?.toFixed(4) ?? '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Technische Daten (Durability, Volume) */}
              {(componentDetail.raw_stats?.durability || componentDetail.raw_stats?.dimension) && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-400 mb-2">Technische Daten</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {componentDetail.raw_stats?.durability && (
                      <div className="p-2 bg-gray-800/50 rounded">
                        <p className="text-xs text-gray-500">Durability</p>
                        <p className="font-medium">{formatNumber((componentDetail.raw_stats.durability as {health?: number}).health)} HP</p>
                      </div>
                    )}
                    {componentDetail.raw_stats?.dimension && (
                      <div className="p-2 bg-gray-800/50 rounded">
                        <p className="text-xs text-gray-500">Volume</p>
                        <p className="font-medium">{formatNumber((componentDetail.raw_stats.dimension as {volume?: number}).volume)} µSCU</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* UEX Preise / Wo kaufbar */}
              <div className="mb-4">
                <h4 className="text-sm font-bold text-krt-orange mb-2 flex items-center gap-2">
                  <MapPin size={16} />
                  Wo kaufbar?
                </h4>
                {isPricesLoading ? (
                  <p className="text-sm text-gray-400">Lade Preisdaten...</p>
                ) : componentPrices && componentPrices.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-700">
                          <th className="pb-2 pr-2">Shop / Terminal</th>
                          <th className="pb-2 text-right">Preis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {componentPrices.map((price) => (
                          <tr key={price.id} className="border-b border-gray-800 last:border-0">
                            <td className="py-1.5 pr-2 text-gray-300">{price.terminal_name}</td>
                            <td className="py-1.5 text-right text-gray-300">
                              {formatPrice(price.price_buy)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Keine Preisdaten verfügbar.
                    {isAdmin && ' Führe einen UEX Sync durch.'}
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-2">
                  Daten von <a href="https://uexcorp.space" target="_blank" rel="noopener noreferrer" className="text-krt-orange hover:underline">UEX</a>
                </p>
              </div>

              {/* Pioneer Inventar */}
              {pioneersWithItem.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-krt-orange mb-2 flex items-center gap-2">
                    <Package size={16} />
                    Im Pioneer-Lager verfügbar
                  </h4>
                  <div className="space-y-2">
                    {pioneersWithItem.map(({ pioneer, quantity }) => (
                      <button
                        key={pioneer.id}
                        onClick={() => navigate('/inventory')}
                        className="w-full flex items-center justify-between p-2 bg-krt-orange/10 border border-krt-orange/30 rounded-lg hover:bg-krt-orange/20 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {pioneer.avatar ? (
                            <img src={pioneer.avatar} alt="" className="w-6 h-6 rounded-full" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                              {pioneer.username?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium">
                            {pioneer.display_name || pioneer.username}
                          </span>
                          <span className="text-xs bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-400">Pioneer</span>
                        </div>
                        <span className="text-sm text-krt-orange font-medium">{quantity}x</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Klicke um zum Lager zu gelangen und das Item anzufragen.
                  </p>
                </div>
              )}

              {/* Typ Info */}
              <div className="text-xs text-gray-500 pt-3 border-t border-gray-700">
                <p>Kategorie: {componentDetail.category} / {componentDetail.sub_category}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
