import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { ArrowLeft, Check, GraduationCap, Save, UserPlus, X } from 'lucide-react'
import type {
  AssignmentMatrixResponse,
  CommandGroup,
  AssignmentEntry,
  User,
} from '../api/types'

type CellState = {
  is_assigned: boolean
  is_training: boolean
}

export default function AssignmentMatrixPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  // Ausgewählte KG - initial aus URL-Parameter
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => {
    const kgParam = searchParams.get('kg')
    return kgParam ? parseInt(kgParam, 10) : null
  })

  // Änderungen tracken
  const [changes, setChanges] = useState<Map<string, CellState>>(new Map())
  const hasChanges = changes.size > 0

  // Modal für User hinzufügen
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  // Alle KGs laden
  const { data: groups, isLoading: groupsLoading } = useQuery<CommandGroup[]>({
    queryKey: ['staffel', 'command-groups'],
    queryFn: () => apiClient.get('/api/staffel/command-groups').then(r => r.data),
  })

  // Matrix-Daten laden
  const { data: matrix, isLoading: matrixLoading } = useQuery<AssignmentMatrixResponse>({
    queryKey: ['staffel', 'matrix', selectedGroupId],
    queryFn: () => apiClient.get(`/api/staffel/command-groups/${selectedGroupId}/assignment-matrix`).then(r => r.data),
    enabled: !!selectedGroupId,
  })

  // Alle User laden (für Add-Modal)
  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then(r => r.data),
    enabled: showAddUserModal,
  })

  // Bulk-Update Mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: (assignments: AssignmentEntry[]) =>
      apiClient.post(`/api/staffel/command-groups/${selectedGroupId}/assignments/bulk`, { assignments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel', 'matrix', selectedGroupId] })
      queryClient.invalidateQueries({ queryKey: ['staffel', 'overview'] })
      setChanges(new Map())
    },
  })

  // User zur KG hinzufügen
  const addUserMutation = useMutation({
    mutationFn: (userId: number) =>
      apiClient.post(`/api/staffel/command-groups/${selectedGroupId}/members`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel', 'matrix', selectedGroupId] })
      queryClient.invalidateQueries({ queryKey: ['staffel', 'overview'] })
      setShowAddUserModal(false)
      setUserSearch('')
    },
  })

  // User die noch nicht in dieser KG sind
  const availableUsers = allUsers?.filter(u =>
    !matrix?.users.some(mu => mu.id === u.id) &&
    u.role !== 'guest' &&
    (u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.username.toLowerCase().includes(userSearch.toLowerCase()))
  ) ?? []

  // Zelle toggle
  const getCellKey = (userId: number, roleId: number) => `${userId}-${roleId}`

  const getCellState = useCallback((userId: number, roleId: number): CellState => {
    const key = getCellKey(userId, roleId)
    if (changes.has(key)) {
      return changes.get(key)!
    }
    const assignment = matrix?.assignments.find(
      a => a.user_id === userId && a.operational_role_id === roleId
    )
    return {
      is_assigned: assignment?.is_assigned ?? false,
      is_training: assignment?.is_training ?? false,
    }
  }, [changes, matrix])

  const toggleCell = (userId: number, roleId: number, shiftKey: boolean) => {
    const key = getCellKey(userId, roleId)
    const current = getCellState(userId, roleId)

    let newState: CellState
    if (shiftKey) {
      // Shift+Klick: Toggle "In Ausbildung"
      if (!current.is_assigned) {
        // Noch nicht zugewiesen -> Zuweisen mit Training
        newState = { is_assigned: true, is_training: true }
      } else {
        // Bereits zugewiesen -> Toggle Training
        newState = { is_assigned: true, is_training: !current.is_training }
      }
    } else {
      // Normaler Klick: Toggle Zuweisung
      newState = { is_assigned: !current.is_assigned, is_training: false }
    }

    // Prüfen ob Änderung zum Original zurückführt
    const original = matrix?.assignments.find(
      a => a.user_id === userId && a.operational_role_id === roleId
    )
    const originalState: CellState = {
      is_assigned: original?.is_assigned ?? false,
      is_training: original?.is_training ?? false,
    }

    const newChanges = new Map(changes)
    if (newState.is_assigned === originalState.is_assigned && newState.is_training === originalState.is_training) {
      newChanges.delete(key)
    } else {
      newChanges.set(key, newState)
    }
    setChanges(newChanges)
  }

  const handleSave = () => {
    if (!matrix) return

    const assignments: AssignmentEntry[] = []

    // Alle Änderungen sammeln
    changes.forEach((state, key) => {
      const [userId, roleId] = key.split('-').map(Number)
      assignments.push({
        user_id: userId,
        operational_role_id: roleId,
        is_assigned: state.is_assigned,
        is_training: state.is_training,
      })
    })

    bulkUpdateMutation.mutate(assignments)
  }

  // Auto-select first group
  if (groups && groups.length > 0 && !selectedGroupId) {
    setSelectedGroupId(groups[0].id)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/struktur" className="text-gray-400 hover:text-white">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-3xl font-bold">Einsatzrollen-Matrix</h1>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={bulkUpdateMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save size={18} />
            {bulkUpdateMutation.isPending ? 'Wird gespeichert...' : `${changes.size} Änderung(en) speichern`}
          </button>
        )}
      </div>

      {/* KG-Auswahl */}
      {groupsLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-2">
          {groups?.map(group => (
            <button
              key={group.id}
              onClick={() => {
                if (hasChanges) {
                  if (!confirm('Du hast ungespeicherte Änderungen. Trotzdem wechseln?')) return
                }
                setSelectedGroupId(group.id)
                setChanges(new Map())
              }}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                selectedGroupId === group.id
                  ? 'bg-krt-orange text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {group.name} - {group.full_name}
            </button>
          ))}
        </div>
      )}

      {/* Legende */}
      <div className="flex items-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-600/30 border border-green-500 rounded flex items-center justify-center">
            <Check size={14} className="text-green-400" />
          </div>
          <span>Zugewiesen</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-yellow-600/30 border border-yellow-500 rounded flex items-center justify-center">
            <GraduationCap size={14} className="text-yellow-400" />
          </div>
          <span>In Ausbildung</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-700/50 border border-gray-600 rounded" />
          <span>Nicht zugewiesen</span>
        </div>
        <span className="text-gray-500">|</span>
        <span>Klick = Toggle | Shift+Klick = In Ausbildung</span>
      </div>

      {/* Matrix */}
      {matrixLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
        </div>
      ) : matrix ? (
        <div className="card overflow-x-auto">
          {/* User hinzufügen Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowAddUserModal(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <UserPlus size={18} />
              Mitglied hinzufügen
            </button>
          </div>

          {matrix.users.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              Keine Mitglieder in dieser Kommandogruppe.
              <button
                onClick={() => setShowAddUserModal(true)}
                className="block mx-auto mt-4 btn btn-primary"
              >
                Erstes Mitglied hinzufügen
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-krt-dark z-10 text-left p-2 border-b border-gray-700 min-w-[150px]">
                    User
                  </th>
                  {matrix.roles.map(role => (
                    <th
                      key={role.id}
                      className="p-2 border-b border-gray-700 text-center min-w-[100px]"
                      title={role.description || ''}
                    >
                      <div className="text-sm font-medium text-krt-orange whitespace-nowrap">
                        {role.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-800/30">
                    <td className="sticky left-0 bg-krt-dark z-10 p-2 border-b border-gray-700/50">
                      <div className="flex items-center gap-2">
                        {user.avatar && (
                          <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
                        )}
                        <span className="text-sm">
                          {user.display_name || user.username}
                        </span>
                      </div>
                    </td>
                    {matrix.roles.map(role => {
                      const state = getCellState(user.id, role.id)
                      const key = getCellKey(user.id, role.id)
                      const isChanged = changes.has(key)

                      return (
                        <td
                          key={role.id}
                          className="p-2 border-b border-gray-700/50 text-center"
                        >
                          <button
                            onClick={(e) => toggleCell(user.id, role.id, e.shiftKey)}
                            className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
                              state.is_training
                                ? 'bg-yellow-600/30 border border-yellow-500 hover:bg-yellow-600/50'
                                : state.is_assigned
                                  ? 'bg-green-600/30 border border-green-500 hover:bg-green-600/50'
                                  : 'bg-gray-700/50 border border-gray-600 hover:bg-gray-600/50'
                            } ${isChanged ? 'ring-2 ring-krt-orange ring-offset-1 ring-offset-krt-dark' : ''}`}
                            title={state.is_training ? 'In Ausbildung' : state.is_assigned ? 'Zugewiesen' : 'Nicht zugewiesen'}
                          >
                            {state.is_training ? (
                              <GraduationCap size={16} className="text-yellow-400" />
                            ) : state.is_assigned ? (
                              <Check size={16} className="text-green-400" />
                            ) : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold">Mitglied zur KG hinzufügen</h2>
              <button
                onClick={() => {
                  setShowAddUserModal(false)
                  setUserSearch('')
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 border-b border-gray-700">
              <input
                type="text"
                placeholder="User suchen..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-krt-orange"
                autoFocus
              />
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {availableUsers.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  {userSearch ? 'Kein User gefunden' : 'Alle User sind bereits Mitglied'}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableUsers.slice(0, 20).map(user => (
                    <button
                      key={user.id}
                      onClick={() => addUserMutation.mutate(user.id)}
                      disabled={addUserMutation.isPending}
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors text-left"
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-gray-400">
                          {(user.display_name || user.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{user.display_name || user.username}</div>
                        {user.display_name && (
                          <div className="text-xs text-gray-500">{user.username}</div>
                        )}
                      </div>
                      <UserPlus size={18} className="text-gray-500" />
                    </button>
                  ))}
                  {availableUsers.length > 20 && (
                    <div className="text-center text-sm text-gray-500 pt-2">
                      + {availableUsers.length - 20} weitere (Suche eingrenzen)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
