import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Shield, User as UserIcon, Compass, Trash2, Link2, X, Plus, Tag, Wallet } from 'lucide-react'
import type { User, UserRole } from '../api/types'

const roleLabels: Record<UserRole, string> = {
  guest: 'Gast',
  member: 'Mitglied',
  officer: 'Offizier',
  treasurer: 'Kassenwart',
  admin: 'Admin',
}

const roleColors: Record<UserRole, string> = {
  guest: 'bg-yellow-600',
  member: 'bg-gray-600',
  officer: 'bg-krt-orange',
  treasurer: 'bg-krt-gold',
  admin: 'bg-red-600',
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<UserRole | null>(null)
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSource, setMergeSource] = useState<User | null>(null)
  const [aliasUser, setAliasUser] = useState<User | null>(null)
  const [newAlias, setNewAlias] = useState('')
  const [userAliases, setUserAliases] = useState<string[]>([])

  const isAdmin = currentUser?.role === 'admin'
  const isOfficer = currentUser?.role === 'officer' || currentUser?.role === 'treasurer' || isAdmin

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
  })

  // Sortierte Benutzer: Admins > Offiziere > Sonderrollen (Pioneer/Kassenwart) > Mitglieder, dann alphabetisch
  const sortedUsers = useMemo(() => {
    if (!users) return []

    const roleOrder: Record<UserRole, number> = {
      admin: 0,
      treasurer: 1,
      officer: 2,
      member: 3,
      guest: 4,
    }

    return [...users].sort((a, b) => {
      // 1. Nach Rolle sortieren
      const roleCompare = roleOrder[a.role] - roleOrder[b.role]
      if (roleCompare !== 0) return roleCompare

      // 2. Bei gleicher Rolle: Sonderrollen (Pioneer/Kassenwart) zuerst
      const aHasFlag = a.is_pioneer || a.is_treasurer
      const bHasFlag = b.is_pioneer || b.is_treasurer
      if (aHasFlag && !bHasFlag) return -1
      if (!aHasFlag && bHasFlag) return 1

      // 3. Alphabetisch nach Display-Name oder Username
      const aName = (a.display_name || a.username).toLowerCase()
      const bName = (b.display_name || b.username).toLowerCase()
      return aName.localeCompare(bName, 'de')
    })
  }, [users])

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) =>
      apiClient.patch(`/api/users/${userId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
      setNewRole(null)
    },
  })

  const togglePioneerMutation = useMutation({
    mutationFn: ({ userId, is_pioneer }: { userId: number; is_pioneer: boolean }) =>
      apiClient.patch(`/api/users/${userId}`, { is_pioneer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const toggleTreasurerMutation = useMutation({
    mutationFn: ({ userId, is_treasurer }: { userId: number; is_treasurer: boolean }) =>
      apiClient.patch(`/api/users/${userId}`, { is_treasurer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => apiClient.delete(`/api/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const mergeUsersMutation = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      apiClient.post('/api/users/merge', { source_user_id: sourceId, target_user_id: targetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setMergeMode(false)
      setMergeSource(null)
      alert('Benutzer erfolgreich zusammengeführt')
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const addAliasMutation = useMutation({
    mutationFn: ({ userId, alias }: { userId: number; alias: string }) =>
      apiClient.post(`/api/users/${userId}/aliases?alias=${encodeURIComponent(alias)}`),
    onSuccess: (response) => {
      setUserAliases(response.data.aliases)
      setNewAlias('')
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      alert(`Fehler: ${error.response?.data?.detail || error.message}`)
    },
  })

  const removeAliasMutation = useMutation({
    mutationFn: ({ userId, alias }: { userId: number; alias: string }) =>
      apiClient.delete(`/api/users/${userId}/aliases/${encodeURIComponent(alias)}`),
    onSuccess: (response) => {
      setUserAliases(response.data.aliases)
    },
  })

  const handleSaveRole = () => {
    if (editingUser && newRole) {
      updateRoleMutation.mutate({ userId: editingUser.id, role: newRole })
    }
  }

  const handleTogglePioneer = (u: User) => {
    togglePioneerMutation.mutate({ userId: u.id, is_pioneer: !u.is_pioneer })
  }

  const handleToggleTreasurer = (u: User) => {
    toggleTreasurerMutation.mutate({ userId: u.id, is_treasurer: !u.is_treasurer })
  }

  const handleDeleteUser = (u: User) => {
    if (window.confirm(`Benutzer "${u.display_name || u.username}" wirklich löschen?\n\nDies kann nicht rückgängig gemacht werden!`)) {
      deleteUserMutation.mutate(u.id)
    }
  }

  const handleMergeClick = (u: User) => {
    if (!mergeSource) {
      setMergeSource(u)
    } else if (mergeSource.id !== u.id) {
      if (window.confirm(
        `"${mergeSource.display_name || mergeSource.username}" mit "${u.display_name || u.username}" zusammenführen?\n\n` +
        `• Alle Daten von "${mergeSource.username}" werden auf "${u.username}" übertragen\n` +
        `• "${mergeSource.username}" wird gelöscht und als Alias hinzugefügt\n\n` +
        `Fortfahren?`
      )) {
        mergeUsersMutation.mutate({ sourceId: mergeSource.id, targetId: u.id })
      }
    }
  }

  const openAliasEditor = async (u: User) => {
    setAliasUser(u)
    try {
      const response = await apiClient.get(`/api/users/${u.id}/aliases`)
      setUserAliases(response.data.aliases)
    } catch {
      setUserAliases([])
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Benutzer</h1>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {mergeMode ? (
              <>
                <span className="text-sm text-gray-400">
                  {mergeSource
                    ? `Wähle Ziel für "${mergeSource.display_name || mergeSource.username}"`
                    : 'Wähle ersten Benutzer (wird gelöscht)'
                  }
                </span>
                <button
                  onClick={() => {
                    setMergeMode(false)
                    setMergeSource(null)
                  }}
                  className="btn btn-secondary"
                >
                  Abbrechen
                </button>
              </>
            ) : (
              <button
                onClick={() => setMergeMode(true)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Link2 size={20} />
                Benutzer zusammenführen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rollen-Legende */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Rollen-Übersicht</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${roleColors.guest}`} />
            <span>Gast - Wartet auf Freischaltung</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${roleColors.member}`} />
            <span>Mitglied - Kann sehen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${roleColors.officer}`} />
            <span>Offizier - Kann verwalten</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${roleColors.treasurer}`} />
            <span>Kassenwart - + Kasse</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${roleColors.admin}`} />
            <span>Admin - Alles</span>
          </div>
          <div className="flex items-center gap-2">
            <Compass size={14} className="text-emerald-500" />
            <span>Pioneer - Versorgung</span>
          </div>
        </div>
      </div>

      {/* Benutzer-Liste */}
      <div className="card">
        <div className="space-y-3">
          {sortedUsers.map((u) => {
            const isSelected = mergeSource?.id === u.id

            return (
              <div
                key={u.id}
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  mergeMode
                    ? isSelected
                      ? 'bg-krt-orange/30 border-2 border-krt-orange'
                      : 'bg-gray-800/50 hover:bg-gray-700/50 cursor-pointer'
                    : 'bg-gray-800/50'
                }`}
                onClick={mergeMode ? () => handleMergeClick(u) : undefined}
              >
                <div className="flex items-center gap-4">
                  {u.avatar ? (
                    <img
                      src={u.avatar}
                      alt=""
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                      <UserIcon size={24} className="text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">
                      {u.display_name || u.username}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-gray-400">(Du)</span>
                      )}
                      {!u.discord_id && (
                        <span className="ml-2 text-xs text-yellow-500">(importiert)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">@{u.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm text-white ${roleColors[u.role]}`}
                  >
                    {roleLabels[u.role]}
                  </span>

                  {u.is_pioneer && (
                    <span className="px-3 py-1 rounded-full text-sm bg-emerald-600 text-white flex items-center gap-1">
                      <Compass size={14} />
                      Pioneer
                    </span>
                  )}

                  {u.is_treasurer && (
                    <span className="px-3 py-1 rounded-full text-sm bg-amber-600 text-white flex items-center gap-1">
                      <Wallet size={14} />
                      Kassenwart
                    </span>
                  )}

                  {!mergeMode && (
                    <>
                      {isOfficer && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openAliasEditor(u)
                          }}
                          className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg"
                          title="Aliase verwalten"
                        >
                          <Tag size={20} />
                        </button>
                      )}

                      {isAdmin && u.id !== currentUser?.id && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTogglePioneer(u)
                            }}
                            className={`p-2 rounded-lg transition-colors ${
                              u.is_pioneer
                                ? 'text-emerald-500 bg-emerald-500/20 hover:bg-emerald-500/30'
                                : 'text-gray-400 hover:text-emerald-500 hover:bg-gray-700'
                            }`}
                            title={u.is_pioneer ? 'Pioneer-Status entfernen' : 'Als Pioneer markieren'}
                          >
                            <Compass size={20} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleTreasurer(u)
                            }}
                            className={`p-2 rounded-lg transition-colors ${
                              u.is_treasurer
                                ? 'text-amber-500 bg-amber-500/20 hover:bg-amber-500/30'
                                : 'text-gray-400 hover:text-amber-500 hover:bg-gray-700'
                            }`}
                            title={u.is_treasurer ? 'Kassenwart-Status entfernen' : 'Als Kassenwart markieren'}
                          >
                            <Wallet size={20} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingUser(u)
                              setNewRole(u.role)
                            }}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
                            title="Rolle ändern"
                          >
                            <Shield size={20} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteUser(u)
                            }}
                            disabled={deleteUserMutation.isPending}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg"
                            title="Benutzer löschen"
                          >
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rollen-Editor Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              Rolle ändern: {editingUser.display_name || editingUser.username}
            </h2>

            <div className="space-y-2 mb-6">
              {(['member', 'officer', 'treasurer', 'admin'] as UserRole[]).map(
                (role) => (
                  <button
                    key={role}
                    onClick={() => setNewRole(role)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      newRole === role
                        ? 'border-krt-orange bg-krt-orange/20'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-3 h-3 rounded-full ${roleColors[role]}`}
                      />
                      <span className="font-medium">{roleLabels[role]}</span>
                    </div>
                  </button>
                )
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingUser(null)
                  setNewRole(null)
                }}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveRole}
                disabled={
                  !newRole ||
                  newRole === editingUser.role ||
                  updateRoleMutation.isPending
                }
                className="btn btn-primary flex-1"
              >
                {updateRoleMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alias-Editor Modal */}
      {aliasUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                Aliase: {aliasUser.display_name || aliasUser.username}
              </h2>
              <button
                onClick={() => {
                  setAliasUser(null)
                  setNewAlias('')
                  setUserAliases([])
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Aliase werden für das automatische Erkennen bei der Anwesenheitserfassung verwendet.
            </p>

            {/* Bestehende Aliase */}
            <div className="space-y-2 mb-4">
              {userAliases.length > 0 ? (
                userAliases.map((alias) => (
                  <div
                    key={alias}
                    className="flex items-center justify-between p-2 bg-gray-800 rounded"
                  >
                    <span>{alias}</span>
                    <button
                      onClick={() => removeAliasMutation.mutate({ userId: aliasUser.id, alias })}
                      className="text-gray-400 hover:text-red-400"
                      title="Alias entfernen"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">Keine Aliase vorhanden</p>
              )}
            </div>

            {/* Neuen Alias hinzufügen */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Neuer Alias..."
                className="input flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlias.trim()) {
                    addAliasMutation.mutate({ userId: aliasUser.id, alias: newAlias.trim() })
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newAlias.trim()) {
                    addAliasMutation.mutate({ userId: aliasUser.id, alias: newAlias.trim() })
                  }
                }}
                disabled={!newAlias.trim() || addAliasMutation.isPending}
                className="btn btn-primary"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
