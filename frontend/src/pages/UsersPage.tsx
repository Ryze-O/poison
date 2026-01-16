import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Shield, User as UserIcon } from 'lucide-react'
import type { User, UserRole } from '../api/types'

const roleLabels: Record<UserRole, string> = {
  member: 'Mitglied',
  officer: 'Offizier',
  treasurer: 'Kassenwart',
  admin: 'Admin',
}

const roleColors: Record<UserRole, string> = {
  member: 'bg-gray-600',
  officer: 'bg-sc-blue',
  treasurer: 'bg-sc-gold',
  admin: 'bg-sc-red',
}

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<UserRole | null>(null)

  const isAdmin = currentUser?.role === 'admin'

  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) =>
      apiClient.patch(`/api/users/${userId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
      setNewRole(null)
    },
  })

  const handleSaveRole = () => {
    if (editingUser && newRole) {
      updateMutation.mutate({ userId: editingUser.id, role: newRole })
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Benutzer</h1>

      {/* Rollen-Legende */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">Rollen-Übersicht</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        </div>
      </div>

      {/* Benutzer-Liste */}
      <div className="card">
        <div className="space-y-3">
          {users?.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
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
                  </p>
                  <p className="text-sm text-gray-400">@{u.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm text-white ${roleColors[u.role]}`}
                >
                  {roleLabels[u.role]}
                </span>

                {isAdmin && u.id !== currentUser?.id && (
                  <button
                    onClick={() => {
                      setEditingUser(u)
                      setNewRole(u.role)
                    }}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
                  >
                    <Shield size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
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
                        ? 'border-sc-blue bg-sc-blue/20'
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
                  updateMutation.isPending
                }
                className="btn btn-primary flex-1"
              >
                {updateMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
