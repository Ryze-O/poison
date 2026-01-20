import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { ClipboardList, Package, Wallet, Users, Gift, MapPin, CheckCircle } from 'lucide-react'
import type { Treasury, AttendanceSession, InventoryItem, LootSession } from '../api/types'

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: treasury } = useQuery<Treasury>({
    queryKey: ['treasury'],
    queryFn: () => apiClient.get('/api/treasury/balance').then((r) => r.data),
  })

  const { data: sessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendance', 'recent'],
    queryFn: () =>
      apiClient.get('/api/attendance?limit=5').then((r) => r.data),
  })

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Letzte Sessions */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <ClipboardList className="text-emerald-500" size={20} />
            <h2 className="text-xl font-bold">Letzte Staffelabende</h2>
          </div>
          {sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/30 hover:border-krt-orange/30 transition-colors"
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
                    <p className="font-medium text-krt-orange flex items-center gap-1 justify-end">
                      <Users size={14} />
                      {session.records.length}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.created_by.display_name || session.created_by.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">Noch keine Sessions vorhanden.</p>
          )}
        </div>

        {/* Letzte Loot-Sessions */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Gift className="text-amber-500" size={20} />
            <h2 className="text-xl font-bold">Letzte Loot-Runs</h2>
          </div>
          {lootSessions && lootSessions.length > 0 ? (
            <div className="space-y-3">
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
      </div>
    </div>
  )
}
