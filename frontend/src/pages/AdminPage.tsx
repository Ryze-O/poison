import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { RefreshCw, Database, MapPin, Package, AlertCircle, CheckCircle } from 'lucide-react'

interface SCImportStats {
  components_added: number
  components_updated: number
  locations_added: number
  locations_updated: number
  errors: string[]
  sc_version: string | null
}

interface SCStats {
  total_components: number
  components_by_category: Record<string, number>
  total_locations: number
  sc_version: string | null
}

export default function AdminPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [lastImport, setLastImport] = useState<SCImportStats | null>(null)

  const isAdmin = user?.role === 'admin'

  const { data: stats, isLoading: statsLoading } = useQuery<SCStats>({
    queryKey: ['sc-stats'],
    queryFn: () => apiClient.get('/api/sc/stats').then((r) => r.data),
    enabled: isAdmin,
  })

  const syncMutation = useMutation({
    mutationFn: () => apiClient.post('/api/sc/sync').then((r) => r.data),
    onSuccess: (data: SCImportStats) => {
      setLastImport(data)
      queryClient.invalidateQueries({ queryKey: ['sc-stats'] })
      queryClient.invalidateQueries({ queryKey: ['components'] })
    },
  })

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="card text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h2 className="text-xl font-bold mb-2">Kein Zugriff</h2>
          <p className="text-gray-400">Diese Seite ist nur für Admins zugänglich.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin-Einstellungen</h1>
        <div className="h-px bg-gradient-to-r from-krt-orange via-krt-orange/50 to-transparent max-w-md" />
      </div>

      {/* SC Data Import Section */}
      <div className="card mb-8">
        <div className="flex items-center gap-3 mb-6">
          <Database className="text-krt-orange" size={24} />
          <h2 className="text-xl font-bold">Star Citizen Daten-Import</h2>
        </div>

        <p className="text-gray-400 mb-6">
          Importiert Schiffskomponenten, Waffen und Orte von der{' '}
          <a
            href="https://star-citizen.wiki"
            target="_blank"
            rel="noopener noreferrer"
            className="text-krt-orange hover:underline"
          >
            star-citizen.wiki
          </a>{' '}
          API.
        </p>

        {/* Current Stats */}
        {statsLoading ? (
          <div className="text-gray-400">Lade Statistiken...</div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Package className="text-emerald-500" size={20} />
                <span className="text-gray-400">Komponenten</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_components}</p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="text-krt-orange" size={20} />
                <span className="text-gray-400">Orte</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_locations}</p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Database className="text-purple-500" size={20} />
                <span className="text-gray-400">SC Version</span>
              </div>
              <p className="text-2xl font-bold">{stats.sc_version || '-'}</p>
            </div>
          </div>
        ) : null}

        {/* Categories Breakdown */}
        {stats?.components_by_category && Object.keys(stats.components_by_category).length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Komponenten nach Kategorie</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.components_by_category).map(([category, count]) => (
                <span
                  key={category}
                  className="px-3 py-1 bg-gray-800 rounded-full text-sm"
                >
                  {category}: <span className="text-krt-orange">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sync Button */}
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          <RefreshCw
            size={20}
            className={syncMutation.isPending ? 'animate-spin' : ''}
          />
          {syncMutation.isPending ? 'Importiere Daten...' : 'SC-Daten synchronisieren'}
        </button>

        {/* Import Results */}
        {lastImport && (
          <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="text-emerald-500" size={20} />
              <span className="font-medium">Import abgeschlossen</span>
              {lastImport.sc_version && (
                <span className="text-sm text-gray-400">
                  (Version {lastImport.sc_version})
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Komponenten hinzugefügt:</span>
                <span className="ml-2 text-emerald-400">{lastImport.components_added}</span>
              </div>
              <div>
                <span className="text-gray-400">Komponenten aktualisiert:</span>
                <span className="ml-2 text-krt-orange">{lastImport.components_updated}</span>
              </div>
              <div>
                <span className="text-gray-400">Orte hinzugefügt:</span>
                <span className="ml-2 text-emerald-400">{lastImport.locations_added}</span>
              </div>
              <div>
                <span className="text-gray-400">Orte aktualisiert:</span>
                <span className="ml-2 text-krt-orange">{lastImport.locations_updated}</span>
              </div>
            </div>

            {lastImport.errors.length > 0 && (
              <div className="mt-4">
                <span className="text-red-400 text-sm">
                  {lastImport.errors.length} Fehler aufgetreten
                </span>
                <details className="mt-2">
                  <summary className="text-gray-400 text-sm cursor-pointer hover:text-white">
                    Details anzeigen
                  </summary>
                  <ul className="mt-2 text-sm text-red-400 space-y-1">
                    {lastImport.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="card border-l-4 border-l-krt-orange">
        <h3 className="font-bold mb-2">Hinweis zum Import</h3>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Der Import kann je nach API-Auslastung einige Minuten dauern</li>
          <li>• Bestehende Komponenten werden anhand der UUID aktualisiert</li>
          <li>• Manuell erstellte Komponenten bleiben erhalten</li>
          <li>• Importierte Komponenten sind als "vordefiniert" markiert</li>
        </ul>
      </div>
    </div>
  )
}
