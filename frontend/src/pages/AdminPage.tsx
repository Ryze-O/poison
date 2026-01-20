import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { RefreshCw, Database, MapPin, Package, AlertCircle, CheckCircle, Upload, FileSpreadsheet, Wallet, Users, Link, Copy, Trash2, ToggleLeft, ToggleRight, Plus } from 'lucide-react'
import type { GuestToken, UserRole } from '../api/types'

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

interface CSVImportResult {
  success: number
  errors: string[]
  warnings: string[]
}

export default function AdminPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [lastImport, setLastImport] = useState<SCImportStats | null>(null)
  const [csvResult, setCsvResult] = useState<CSVImportResult | null>(null)
  const [csvType, setCsvType] = useState<'inventory' | 'treasury' | 'members' | null>(null)
  const inventoryFileRef = useRef<HTMLInputElement>(null)
  const treasuryFileRef = useRef<HTMLInputElement>(null)
  const membersFileRef = useRef<HTMLInputElement>(null)

  // Gäste-Token States
  const [showNewTokenForm, setShowNewTokenForm] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenRole, setNewTokenRole] = useState<UserRole>('member')
  const [newTokenExpiresDays, setNewTokenExpiresDays] = useState<number | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  const { data: stats, isLoading: statsLoading } = useQuery<SCStats>({
    queryKey: ['sc-stats'],
    queryFn: () => apiClient.get('/api/sc/stats').then((r) => r.data),
    enabled: isAdmin,
  })

  // Gäste-Tokens
  const { data: guestTokens } = useQuery<GuestToken[]>({
    queryKey: ['guest-tokens'],
    queryFn: () => apiClient.get('/api/auth/guest-tokens').then((r) => r.data),
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

  const inventoryImportMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post('/api/import/inventory', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: (data: CSVImportResult) => {
      setCsvResult(data)
      setCsvType('inventory')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const treasuryImportMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post('/api/import/treasury', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: (data: CSVImportResult) => {
      setCsvResult(data)
      setCsvType('treasury')
      queryClient.invalidateQueries({ queryKey: ['treasury'] })
    },
  })

  const membersImportMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post('/api/import/members', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: (data: CSVImportResult) => {
      setCsvResult(data)
      setCsvType('members')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  // Gäste-Token Mutations
  const createGuestTokenMutation = useMutation({
    mutationFn: (data: { name: string; role: UserRole; expires_in_days: number | null }) =>
      apiClient.post('/api/auth/guest-tokens', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-tokens'] })
      setShowNewTokenForm(false)
      setNewTokenName('')
      setNewTokenRole('member')
      setNewTokenExpiresDays(null)
    },
  })

  const toggleGuestTokenMutation = useMutation({
    mutationFn: (tokenId: number) =>
      apiClient.post(`/api/auth/guest-tokens/${tokenId}/toggle`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-tokens'] })
    },
  })

  const deleteGuestTokenMutation = useMutation({
    mutationFn: (tokenId: number) =>
      apiClient.delete(`/api/auth/guest-tokens/${tokenId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-tokens'] })
    },
  })

  const handleInventoryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      inventoryImportMutation.mutate(file)
      e.target.value = ''
    }
  }

  const handleTreasuryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      treasuryImportMutation.mutate(file)
      e.target.value = ''
    }
  }

  const handleMembersFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      membersImportMutation.mutate(file)
      e.target.value = ''
    }
  }

  const copyGuestLink = (token: string) => {
    const link = `${window.location.origin}/guest/${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nie'
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

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

      {/* CSV Import Section */}
      <div className="card mb-8">
        <div className="flex items-center gap-3 mb-6">
          <FileSpreadsheet className="text-krt-orange" size={24} />
          <h2 className="text-xl font-bold">CSV-Daten-Import</h2>
        </div>

        <p className="text-gray-400 mb-6">
          Importiere Inventar-Bestände oder Kassen-Transaktionen aus einer CSV-Datei.
          Exportiere deine Google Sheets als CSV und lade sie hier hoch.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Mitglieder Import */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Users className="text-krt-orange" size={20} />
              <h3 className="font-medium">Mitglieder importieren</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              CSV-Format: Username, DisplayName, Rolle
            </p>
            <input
              ref={membersFileRef}
              type="file"
              accept=".csv"
              onChange={handleMembersFile}
              className="hidden"
            />
            <button
              onClick={() => membersFileRef.current?.click()}
              disabled={membersImportMutation.isPending}
              className="btn btn-secondary flex items-center gap-2 w-full justify-center"
            >
              <Upload size={18} />
              {membersImportMutation.isPending ? 'Importiere...' : 'CSV hochladen'}
            </button>
          </div>

          {/* Inventar Import */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Package className="text-emerald-500" size={20} />
              <h3 className="font-medium">Inventar importieren</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              CSV-Format: Username, Item, Menge, Standort
            </p>
            <input
              ref={inventoryFileRef}
              type="file"
              accept=".csv"
              onChange={handleInventoryFile}
              className="hidden"
            />
            <button
              onClick={() => inventoryFileRef.current?.click()}
              disabled={inventoryImportMutation.isPending}
              className="btn btn-secondary flex items-center gap-2 w-full justify-center"
            >
              <Upload size={18} />
              {inventoryImportMutation.isPending ? 'Importiere...' : 'CSV hochladen'}
            </button>
          </div>

          {/* Kassen Import */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Wallet className="text-sc-gold" size={20} />
              <h3 className="font-medium">Kasse importieren</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              CSV-Format: Datum, Betrag, Typ, Beschreibung
            </p>
            <input
              ref={treasuryFileRef}
              type="file"
              accept=".csv"
              onChange={handleTreasuryFile}
              className="hidden"
            />
            <button
              onClick={() => treasuryFileRef.current?.click()}
              disabled={treasuryImportMutation.isPending}
              className="btn btn-secondary flex items-center gap-2 w-full justify-center"
            >
              <Upload size={18} />
              {treasuryImportMutation.isPending ? 'Importiere...' : 'CSV hochladen'}
            </button>
          </div>
        </div>

        {/* CSV Import Results */}
        {csvResult && (
          <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="text-emerald-500" size={20} />
              <span className="font-medium">
                {csvType === 'inventory' ? 'Inventar' : csvType === 'treasury' ? 'Kassen' : 'Mitglieder'}-Import abgeschlossen
              </span>
            </div>

            <div className="text-sm mb-3">
              <span className="text-emerald-400">{csvResult.success}</span> Einträge erfolgreich importiert
            </div>

            {csvResult.warnings.length > 0 && (
              <div className="mb-3">
                <span className="text-yellow-400 text-sm">
                  {csvResult.warnings.length} Warnungen
                </span>
                <ul className="mt-1 text-sm text-yellow-400 space-y-1">
                  {csvResult.warnings.slice(0, 5).map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                  {csvResult.warnings.length > 5 && (
                    <li className="text-gray-500">... und {csvResult.warnings.length - 5} weitere</li>
                  )}
                </ul>
              </div>
            )}

            {csvResult.errors.length > 0 && (
              <div>
                <span className="text-red-400 text-sm">
                  {csvResult.errors.length} Fehler
                </span>
                <details className="mt-1">
                  <summary className="text-gray-400 text-sm cursor-pointer hover:text-white">
                    Details anzeigen
                  </summary>
                  <ul className="mt-2 text-sm text-red-400 space-y-1 max-h-40 overflow-y-auto">
                    {csvResult.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        )}

        {/* CSV Format Info */}
        <div className="mt-6 p-4 bg-gray-800/30 rounded-lg">
          <h4 className="font-medium mb-2">CSV-Format Beispiele</h4>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 mb-1">Mitglieder:</p>
              <code className="block bg-gray-900 p-2 rounded text-xs">
                Username,DisplayName,Rolle<br/>
                ryze,Ryze,officer<br/>
                mando,Mando,member
              </code>
            </div>
            <div>
              <p className="text-gray-400 mb-1">Inventar:</p>
              <code className="block bg-gray-900 p-2 rounded text-xs">
                Username,Item,Menge,Standort<br/>
                Ryze,Aegis Avenger,1,Lorville<br/>
                Ryze,Behring Laser,4,Area18
              </code>
            </div>
            <div>
              <p className="text-gray-400 mb-1">Kasse:</p>
              <code className="block bg-gray-900 p-2 rounded text-xs">
                Datum,Betrag,Typ,Beschreibung<br/>
                2024-01-15,50000,income,Beiträge<br/>
                2024-01-20,-15000,expense,Versicherung
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Gäste-Token Section */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link className="text-krt-orange" size={24} />
            <h2 className="text-xl font-bold">Gäste-Links</h2>
          </div>
          <button
            onClick={() => setShowNewTokenForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Neuer Gäste-Link
          </button>
        </div>

        <p className="text-gray-400 mb-6">
          Erstelle Gäste-Links für Personen ohne Discord-Account. Sie können sich mit dem Link anmelden und die App nutzen.
        </p>

        {/* Neuen Token erstellen */}
        {showNewTokenForm && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-krt-orange">
            <h3 className="font-medium mb-4">Neuen Gäste-Link erstellen</h3>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label">Name des Gastes *</label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="z.B. Papa"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Rolle</label>
                <select
                  value={newTokenRole}
                  onChange={(e) => setNewTokenRole(e.target.value as UserRole)}
                  className="input"
                >
                  <option value="member">Member (nur ansehen)</option>
                  <option value="officer">Officer</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Gültig für</label>
                <select
                  value={newTokenExpiresDays ?? ''}
                  onChange={(e) => setNewTokenExpiresDays(e.target.value ? parseInt(e.target.value) : null)}
                  className="input"
                >
                  <option value="">Unbegrenzt</option>
                  <option value="1">1 Tag</option>
                  <option value="7">7 Tage</option>
                  <option value="30">30 Tage</option>
                  <option value="90">90 Tage</option>
                  <option value="365">1 Jahr</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (newTokenName.trim()) {
                    createGuestTokenMutation.mutate({
                      name: newTokenName.trim(),
                      role: newTokenRole,
                      expires_in_days: newTokenExpiresDays
                    })
                  }
                }}
                disabled={!newTokenName.trim() || createGuestTokenMutation.isPending}
                className="btn btn-primary"
              >
                {createGuestTokenMutation.isPending ? 'Erstelle...' : 'Link erstellen'}
              </button>
              <button
                onClick={() => {
                  setShowNewTokenForm(false)
                  setNewTokenName('')
                  setNewTokenRole('member')
                  setNewTokenExpiresDays(null)
                }}
                className="btn bg-gray-700 hover:bg-gray-600"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Token-Liste */}
        {guestTokens && guestTokens.length > 0 ? (
          <div className="space-y-3">
            {guestTokens.map((token) => (
              <div
                key={token.id}
                className={`bg-gray-800/50 rounded-lg p-4 border ${
                  token.is_active ? 'border-gray-700' : 'border-red-900/50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{token.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        token.role === 'admin' ? 'bg-red-900/50 text-red-400' :
                        token.role === 'treasurer' ? 'bg-yellow-900/50 text-yellow-400' :
                        token.role === 'officer' ? 'bg-blue-900/50 text-blue-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>
                        {token.role}
                      </span>
                      {!token.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400">
                          Deaktiviert
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Erstellt: {formatDate(token.created_at)}
                      {token.expires_at && ` • Läuft ab: ${formatDate(token.expires_at)}`}
                      {token.last_used_at && ` • Zuletzt genutzt: ${formatDate(token.last_used_at)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyGuestLink(token.token)}
                      className="btn bg-gray-700 hover:bg-gray-600 flex items-center gap-2"
                      title="Link kopieren"
                    >
                      <Copy size={16} />
                      {copiedToken === token.token ? 'Kopiert!' : 'Link kopieren'}
                    </button>
                    <button
                      onClick={() => toggleGuestTokenMutation.mutate(token.id)}
                      className={`btn flex items-center gap-2 ${
                        token.is_active
                          ? 'bg-gray-700 hover:bg-gray-600'
                          : 'bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400'
                      }`}
                      title={token.is_active ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      {token.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Gäste-Link "${token.name}" wirklich deaktivieren?`)) {
                          deleteGuestTokenMutation.mutate(token.id)
                        }
                      }}
                      className="btn bg-red-900/50 hover:bg-red-800/50 text-red-400"
                      title="Löschen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Noch keine Gäste-Links erstellt.
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="card border-l-4 border-l-krt-orange">
        <h3 className="font-bold mb-2">Hinweis zum Import</h3>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Der SC-Import kann je nach API-Auslastung einige Minuten dauern</li>
          <li>• Bestehende Komponenten werden anhand der UUID aktualisiert</li>
          <li>• Manuell erstellte Komponenten bleiben erhalten</li>
          <li>• Importierte Komponenten sind als "vordefiniert" markiert</li>
          <li>• CSV-Import: Für Inventar müssen User und Items bereits existieren</li>
          <li>• Mitglieder-Import: Neue User werden ohne Discord-ID angelegt</li>
          <li>• Bestehende User werden beim Mitglieder-Import aktualisiert (nach Username)</li>
        </ul>
      </div>
    </div>
  )
}
