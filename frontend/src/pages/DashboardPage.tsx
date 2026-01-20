import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { ClipboardList, Package, Wallet, Users, Gift, MapPin, CheckCircle, X, ExternalLink, Gamepad2, Target } from 'lucide-react'
import type { Treasury, AttendanceSession, InventoryItem, LootSession, SessionType } from '../api/types'

const SESSION_TYPE_CONFIG: Record<SessionType, { label: string; color: string; bgColor: string; icon: typeof ClipboardList }> = {
  staffelabend: { label: 'Staffelabend', color: 'emerald-500', bgColor: 'emerald-500/20', icon: ClipboardList },
  loot_run: { label: 'Loot-Run', color: 'amber-500', bgColor: 'amber-500/20', icon: Target },
  freeplay: { label: 'Freeplay', color: 'blue-500', bgColor: 'blue-500/20', icon: Gamepad2 },
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null)

  const canManageSession = user?.role === 'admin' || user?.role === 'officer' || user?.role === 'treasurer'

  const { data: treasury } = useQuery<Treasury>({
    queryKey: ['treasury'],
    queryFn: () => apiClient.get('/api/treasury/balance').then((r) => r.data),
  })

  const { data: sessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendance', 'recent'],
    queryFn: () =>
      apiClient.get('/api/attendance?limit=15').then((r) => r.data),
  })

  // Sessions nach Typ filtern
  const staffelabendSessions = sessions?.filter(s => s.session_type === 'staffelabend' || !s.session_type).slice(0, 5) ?? []
  const lootRunSessions = sessions?.filter(s => s.session_type === 'loot_run').slice(0, 5) ?? []
  const freeplaySessions = sessions?.filter(s => s.session_type === 'freeplay').slice(0, 5) ?? []

  const { data: lootSessions } = useQuery<LootSession[]>({
    queryKey: ['loot', 'recent'],
    queryFn: () => apiClient.get('/api/loot?limit=5').then((r) => r.data),
  })

  const { data: myInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', 'my'],
    queryFn: () => apiClient.get('/api/inventory/my').then((r) => r.data),
    enabled: user?.role !== 'member',
  })

  const canManage = user?.role !== 'member'

  // Hilfsfunktion für Session-Karten
  const renderSessionCard = (session: AttendanceSession, type: SessionType) => {
    const config = SESSION_TYPE_CONFIG[type]
    return (
      <div
        key={session.id}
        onClick={() => canManageSession ? setSelectedSession(session) : undefined}
        className={`flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/30 hover:border-${config.color}/30 transition-colors ${
          canManageSession ? 'cursor-pointer' : ''
        }`}
      >
        <div>
          <p className="font-medium flex items-center gap-2">
            {new Date(session.date).toLocaleDateString('de-DE', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
            {session.is_confirmed && (
              <CheckCircle size={14} className="text-green-500" />
            )}
          </p>
          {session.notes && (
            <p className="text-sm text-gray-400">{session.notes}</p>
          )}
        </div>
        <div className="text-right">
          <p className={`font-medium text-${config.color} flex items-center gap-1 justify-end`}>
            <Users size={14} />
            {session.records.length}
          </p>
          <p className="text-xs text-gray-500">
            {session.created_by.display_name || session.created_by.username}
          </p>
        </div>
      </div>
    )
  }

  // Hilfsfunktion für Session-Listen
  const renderSessionList = (sessionList: AttendanceSession[], type: SessionType, emptyMessage: string) => {
    const config = SESSION_TYPE_CONFIG[type]
    const Icon = config.icon
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Icon className={`text-${config.color}`} size={20} />
          <h2 className="text-xl font-bold">Letzte {config.label}s</h2>
        </div>
        {sessionList.length > 0 ? (
          <div className="space-y-3">
            {sessionList.map((session) => renderSessionCard(session, type))}
          </div>
        ) : (
          <p className="text-gray-400">{emptyMessage}</p>
        )}
      </div>
    )
  }

  // Berechne Loot-Statistiken
  const recentLootItems = lootSessions?.reduce((sum, s) =>
    sum + s.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
  ) ?? 0

  return (
    <div>
      {/* Header mit Begrüßung */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Willkommen, {user?.display_name || user?.username}!
        </h1>
        <div className="h-px bg-gradient-to-r from-krt-orange via-krt-orange/50 to-transparent max-w-md" />
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card border-l-4 border-l-krt-orange">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-krt-orange/20 rounded-lg">
              <Wallet className="text-krt-orange" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Kassenstand</p>
              <p className="text-2xl font-bold">
                {treasury?.current_balance.toLocaleString('de-DE')} aUEC
              </p>
            </div>
          </div>
        </div>

        <div className="card border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <ClipboardList className="text-emerald-500" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Letzte Session</p>
              <p className="text-2xl font-bold">
                {sessions?.[0]
                  ? new Date(sessions[0].date).toLocaleDateString('de-DE')
                  : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="card border-l-4 border-l-amber-500">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-lg">
              <Gift className="text-amber-500" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Loot (letzte 5)</p>
              <p className="text-2xl font-bold">
                {recentLootItems} Items
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="card border-l-4 border-l-purple-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Package className="text-purple-400" size={24} />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Mein Lager</p>
                <p className="text-2xl font-bold">
                  {myInventory?.reduce((sum, item) => sum + item.quantity, 0) ??
                    0}{' '}
                  Items
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session-Listen nach Typ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {renderSessionList(staffelabendSessions, 'staffelabend', 'Noch keine Staffelabende vorhanden.')}
        {renderSessionList(lootRunSessions, 'loot_run', 'Noch keine Loot-Runs vorhanden.')}
        {renderSessionList(freeplaySessions, 'freeplay', 'Noch keine Freeplay-Sessions vorhanden.')}
      </div>

      {/* Letzte Loot-Sessions (Items) */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Gift className="text-amber-500" size={20} />
          <h2 className="text-xl font-bold">Letzte Loot-Verteilungen</h2>
        </div>
        {lootSessions && lootSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lootSessions.map((session) => {
              const totalItems = session.items.reduce((sum, item) => sum + item.quantity, 0)
              const totalDistributed = session.items.reduce(
                (sum, item) => sum + item.distributions.reduce((s, d) => s + d.quantity, 0),
                0
              )
              const sessionDate = session.date || session.created_at

              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/30 hover:border-amber-500/30 transition-colors"
                >
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {new Date(sessionDate).toLocaleDateString('de-DE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {session.is_completed && (
                        <CheckCircle size={14} className="text-green-500" />
                      )}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      {session.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {session.location.name}
                        </span>
                      )}
                      {session.notes && !session.location && (
                        <span>{session.notes}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium flex items-center gap-1 justify-end ${
                      totalDistributed === totalItems && totalItems > 0 ? 'text-green-500' : 'text-amber-500'
                    }`}>
                      <Package size={14} />
                      {totalDistributed}/{totalItems}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.created_by.display_name || session.created_by.username}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-400">Noch keine Loot-Sessions vorhanden.</p>
        )}
      </div>

      {/* Session-Details Modal (nur für Admin/Officer) */}
      {selectedSession && canManageSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                {(() => {
                  const config = SESSION_TYPE_CONFIG[selectedSession.session_type] || SESSION_TYPE_CONFIG.staffelabend
                  const Icon = config.icon
                  return <Icon className={`text-${config.color}`} size={24} />
                })()}
                {SESSION_TYPE_CONFIG[selectedSession.session_type]?.label || 'Staffelabend'}
              </h2>
              <button onClick={() => setSelectedSession(null)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Session-Info */}
            <div className="space-y-4">
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <p className="text-lg font-medium">
                  {new Date(selectedSession.date).toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                {selectedSession.notes && (
                  <p className="text-gray-400 mt-1">{selectedSession.notes}</p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Erstellt von {selectedSession.created_by.display_name || selectedSession.created_by.username}
                </p>
              </div>

              {/* Teilnehmer */}
              <div>
                <p className="text-sm text-gray-400 mb-2">
                  Teilnehmer ({selectedSession.records.length})
                </p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {selectedSession.records.map((record) => (
                    <span
                      key={record.id}
                      className="px-3 py-1 bg-gray-800 rounded-full text-sm"
                    >
                      {record.user?.display_name || record.user?.username || record.detected_name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Status-Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedSession.is_confirmed && (
                  <span className="px-3 py-1 bg-green-600/30 text-green-400 rounded-full text-sm flex items-center gap-1">
                    <CheckCircle size={14} />
                    Bestätigt
                  </span>
                )}
                {selectedSession.has_loot_session && (
                  <span className="px-3 py-1 bg-krt-orange/30 text-krt-orange rounded-full text-sm flex items-center gap-1">
                    <Package size={14} />
                    Hat Loot-Session
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setSelectedSession(null)}
                className="btn bg-gray-700 hover:bg-gray-600"
              >
                Schließen
              </button>
              <a
                href="/attendance"
                className="btn btn-primary flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Zur Anwesenheit
              </a>
              {selectedSession.has_loot_session && selectedSession.loot_session_id && (
                <a
                  href={`/loot?session=${selectedSession.loot_session_id}`}
                  className="btn bg-krt-orange hover:bg-krt-orange/80 flex items-center gap-2"
                >
                  <Package size={16} />
                  Zur Loot-Session
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
