import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Gift } from 'lucide-react'
import type { LootSession } from '../api/types'

export default function LootPage() {
  const { user } = useAuthStore()

  const { data: sessions } = useQuery<LootSession[]>({
    queryKey: ['loot'],
    queryFn: () => apiClient.get('/api/loot').then((r) => r.data),
  })

  const canCreate = user?.role !== 'member'

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Loot-Verteilung</h1>
        {canCreate && (
          <p className="text-gray-400">
            Loot wird über die Anwesenheits-Sessions erstellt
          </p>
        )}
      </div>

      {/* Info */}
      <div className="card mb-8 bg-sc-blue/10 border-sc-blue/30">
        <div className="flex items-start gap-4">
          <Gift className="text-sc-blue mt-1" size={24} />
          <div>
            <h3 className="font-bold mb-1">So funktioniert die Loot-Verteilung</h3>
            <ol className="text-gray-300 space-y-1 text-sm list-decimal list-inside">
              <li>Erstelle eine Anwesenheits-Session mit allen Teilnehmern</li>
              <li>Erfasse die gelooteten Komponenten</li>
              <li>Verteile den Loot auf die anwesenden Mitglieder</li>
              <li>Die Komponenten landen automatisch im jeweiligen Lager</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Loot Sessions */}
      <div className="space-y-4">
        {sessions && sessions.length > 0 ? (
          sessions.map((session) => (
            <div key={session.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">
                    Session #{session.id}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {new Date(session.created_at).toLocaleDateString('de-DE', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                </div>
                <span className="text-sm text-gray-500">
                  von {session.created_by.display_name || session.created_by.username}
                </span>
              </div>

              {session.items.length > 0 ? (
                <div className="space-y-3">
                  {session.items.map((item) => {
                    const distributed = item.distributions.reduce(
                      (sum, d) => sum + d.quantity,
                      0
                    )
                    const remaining = item.quantity - distributed

                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-gray-800/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">{item.component.name}</p>
                          <span className="text-sm">
                            {distributed}/{item.quantity} verteilt
                            {remaining > 0 && (
                              <span className="text-yellow-500 ml-2">
                                ({remaining} übrig)
                              </span>
                            )}
                          </span>
                        </div>
                        {item.distributions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {item.distributions.map((dist) => (
                              <span
                                key={dist.id}
                                className="px-2 py-1 bg-gray-700 rounded text-sm"
                              >
                                {dist.user.display_name || dist.user.username}:{' '}
                                {dist.quantity}x
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-400">Keine Loot-Items erfasst.</p>
              )}
            </div>
          ))
        ) : (
          <div className="card text-center py-12">
            <Gift className="mx-auto text-gray-600 mb-4" size={48} />
            <p className="text-gray-400">Noch keine Loot-Sessions vorhanden.</p>
          </div>
        )}
      </div>
    </div>
  )
}
