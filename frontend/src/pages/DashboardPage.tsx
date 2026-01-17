import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { ClipboardList, Package, Wallet, Users } from 'lucide-react'
import type { Treasury, AttendanceSession, InventoryItem } from '../api/types'

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: treasury } = useQuery<Treasury>({
    queryKey: ['treasury'],
    queryFn: () => apiClient.get('/api/treasury/balance').then((r) => r.data),
  })

  const { data: sessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendance', 'recent'],
    queryFn: () =>
      apiClient.get('/api/attendance/?limit=5').then((r) => r.data),
  })

  const { data: myInventory } = useQuery<InventoryItem[]>({
    queryKey: ['inventory', 'my'],
    queryFn: () => apiClient.get('/api/inventory/my').then((r) => r.data),
    enabled: user?.role !== 'member',
  })

  const canManage = user?.role !== 'member'

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
              <Users className="text-amber-500" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Letzte Teilnehmer</p>
              <p className="text-2xl font-bold">
                {sessions?.[0]?.records.length ?? 0}
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

      {/* Letzte Sessions */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-bold">Letzte Staffelabende</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-gray-700 to-transparent" />
        </div>
        {sessions && sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/30 hover:border-krt-orange/30 transition-colors"
              >
                <div>
                  <p className="font-medium">
                    {new Date(session.date).toLocaleDateString('de-DE', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  {session.notes && (
                    <p className="text-sm text-gray-400">{session.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium text-krt-orange">{session.records.length} Teilnehmer</p>
                  <p className="text-sm text-gray-400">
                    von {session.created_by.display_name || session.created_by.username}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Noch keine Sessions vorhanden.</p>
        )}
      </div>
    </div>
  )
}
