import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import type { Component, ComponentDetail } from '../api/types'


// Class-Farben
const classColors: Record<string, string> = {
  Military: 'text-red-400 bg-red-900/30 border-red-700',
  Industrial: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  Civilian: 'text-blue-400 bg-blue-900/30 border-blue-700',
  Stealth: 'text-purple-400 bg-purple-900/30 border-purple-700',
  Competition: 'text-green-400 bg-green-900/30 border-green-700',
}

// Grade-Farben
const gradeColors: Record<string, string> = {
  A: 'text-green-400',
  B: 'text-blue-400',
  C: 'text-yellow-400',
  D: 'text-red-400',
}

export default function ComponentBrowserPage() {
  useAuthStore() // Auth check
  const [search, setSearch] = useState('')
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null)
  const [subCategoryFilter, setSubCategoryFilter] = useState('')

  // Suche nach Komponenten
  const { data: searchResults, isLoading: isSearching } = useQuery<Component[]>({
    queryKey: ['component-search', search],
    queryFn: () => apiClient.get(`/api/items/search?q=${encodeURIComponent(search)}`).then(r => r.data),
    enabled: search.length >= 2,
  })

  // Sub-Kategorien für Ship Components
  const { data: subCategories } = useQuery<string[]>({
    queryKey: ['items', 'sub-categories', 'Ship Components'],
    queryFn: () => apiClient.get('/api/items/sub-categories?category=Ship+Components').then(r => r.data),
  })

  // Detail-Daten für ausgewählte Komponente
  const { data: componentDetail, isLoading: isLoadingDetail } = useQuery<ComponentDetail>({
    queryKey: ['component-detail', selectedComponent?.id],
    queryFn: () => apiClient.get(`/api/items/${selectedComponent!.id}/details`).then(r => r.data),
    enabled: !!selectedComponent,
  })

  // Gefilterte Ergebnisse
  const filteredResults = searchResults?.filter(c => {
    if (!subCategoryFilter) return true
    return c.sub_category === subCategoryFilter
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Component Browser</h1>
        <p className="text-gray-400">
          Durchsuche Ship Components nach Name, Hersteller oder Typ. Zeigt Class, Grade und Stats.
        </p>
      </div>

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
              placeholder='Suche nach Komponente (z.B. "FR-76", "Sukoran", "Aegis")...'
              className="input pl-10"
              autoFocus
            />
          </div>
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
          Fuzzy-Suche: "TS2" findet auch "TS-2" | Min. 2 Zeichen
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

          {search.length < 2 ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Gib mindestens 2 Zeichen ein um zu suchen.</p>
            </div>
          ) : isSearching ? (
            <div className="card text-center py-8">
              <p className="text-gray-400">Suche...</p>
            </div>
          ) : filteredResults && filteredResults.length > 0 ? (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredResults.map((comp) => (
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
                    <div>
                      <p className="font-medium">{comp.name}</p>
                      <p className="text-sm text-gray-500">
                        {comp.manufacturer && <span>{comp.manufacturer} · </span>}
                        {comp.sub_category}
                        {comp.size && <span> · S{comp.size}</span>}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-500" />
                  </div>
                </button>
              ))}
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
                  <h4 className="text-sm font-bold text-yellow-400 mb-2 flex items-center gap-2">
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
                  <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
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
