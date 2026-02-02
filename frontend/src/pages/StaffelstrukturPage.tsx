import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import {
  Users, Shield, Anchor, Rocket, Truck, X, UserPlus,
  Pencil, Plus
} from 'lucide-react'
import type {
  StaffelOverview, User, MemberStatus, UserCommandGroup,
  FunctionRoleWithUsers, CommandGroupDetail
} from '../api/types'

// Status Farben
const statusColors: Record<MemberStatus, string> = {
  ACTIVE: 'text-white',
  RECRUIT: 'text-krt-orange',
  INACTIVE: 'text-red-400',
  ABSENT: 'text-gray-500',
}

const statusLabels: Record<MemberStatus, string> = {
  ACTIVE: 'Aktiv',
  RECRUIT: 'Rekrut',
  INACTIVE: 'Inaktiv',
  ABSENT: 'Abwesend',
}

// KG Icons
const kgIcons: Record<string, typeof Shield> = {
  CW: Anchor,
  SW: Rocket,
  P: Truck,
}

export default function StaffelstrukturPage() {
  const queryClient = useQueryClient()

  // States
  const [addMemberModal, setAddMemberModal] = useState<{ groupId: number; groupName: string } | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<MemberStatus>('ACTIVE')

  // Modal States
  const [assignRoleModal, setAssignRoleModal] = useState<{ role: FunctionRoleWithUsers; type: 'leadership' | 'function' } | null>(null)
  const [editGroupModal, setEditGroupModal] = useState<CommandGroupDetail | null>(null)
  const [manageShipsModal, setManageShipsModal] = useState<CommandGroupDetail | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [newShipName, setNewShipName] = useState('')

  // Data fetching
  const { data: overview, isLoading } = useQuery<StaffelOverview>({
    queryKey: ['staffel', 'overview'],
    queryFn: () => apiClient.get('/api/staffel/overview').then(r => r.data),
  })

  const canManage = overview?.can_manage ?? false

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then(r => r.data),
    enabled: canManage,
  })

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: (data: { groupId: number; userId: number; status: MemberStatus }) =>
      apiClient.post(`/api/staffel/command-groups/${data.groupId}/members`, {
        user_id: data.userId,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel'] })
      setAddMemberModal(null)
      setSelectedUserId(null)
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: (data: { membershipId: number; status: MemberStatus }) =>
      apiClient.patch(`/api/staffel/members/${data.membershipId}`, { status: data.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffel'] }),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: number) => apiClient.delete(`/api/staffel/members/${membershipId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffel'] }),
  })

  const assignFunctionRoleMutation = useMutation({
    mutationFn: (data: { userId: number; roleId: number }) =>
      apiClient.post(`/api/staffel/users/${data.userId}/function-roles`, {
        user_id: data.userId,
        function_role_id: data.roleId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel'] })
      setAssignRoleModal(null)
      setSelectedUserId(null)
    },
  })

  const removeFunctionRoleMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      apiClient.delete(`/api/staffel/user-function-roles/${assignmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffel'] }),
  })

  const updateGroupMutation = useMutation({
    mutationFn: (data: { groupId: number; description: string }) =>
      apiClient.patch(`/api/staffel/command-groups/${data.groupId}`, { description: data.description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel'] })
      setEditGroupModal(null)
    },
  })

  const addShipMutation = useMutation({
    mutationFn: (data: { groupId: number; shipName: string }) =>
      apiClient.post(`/api/staffel/command-groups/${data.groupId}/ships`, {
        ship_name: data.shipName,
        sort_order: 99,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel'] })
      setNewShipName('')
    },
  })

  const removeShipMutation = useMutation({
    mutationFn: (shipId: number) => apiClient.delete(`/api/staffel/ships/${shipId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffel'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!overview) {
    return <div className="text-center text-gray-400 py-12">Keine Daten verfügbar</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Staffelstruktur</h1>

      {/* Staffelleitung */}
      {overview.leadership_roles.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Shield className="text-krt-orange" size={20} />
            Staffelleitung
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {overview.leadership_roles.map(role => (
              <LeadershipCard
                key={role.id}
                role={role}
                canManage={canManage}
                onAssign={() => setAssignRoleModal({ role, type: 'leadership' })}
                onRemove={(assignmentId) => {
                  if (confirm('User wirklich aus dieser Rolle entfernen?')) {
                    removeFunctionRoleMutation.mutate(assignmentId)
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Kommandogruppen - 3 Spalten mit gleicher Höhe */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {overview.command_groups.map(group => {
          const Icon = kgIcons[group.name] || Users
          const membersByStatus = {
            RECRUIT: group.members.filter(m => m.status === 'RECRUIT'),
            ACTIVE: group.members.filter(m => m.status === 'ACTIVE'),
            INACTIVE: group.members.filter(m => m.status === 'INACTIVE'),
            ABSENT: group.members.filter(m => m.status === 'ABSENT'),
          }

          return (
            <div key={group.id} className="card flex flex-col">
              {/* Header - gleiche Höhe */}
              <div className="flex items-start justify-between mb-4 min-h-[60px]">
                <div className="flex items-center gap-3">
                  <Icon className="text-krt-orange flex-shrink-0" size={28} />
                  <div>
                    <h2 className="text-xl font-bold">{group.name}</h2>
                    <p className="text-sm text-gray-400">{group.full_name}</p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditDescription(group.description || '')
                        setEditGroupModal(group)
                      }}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                      title="Beschreibung bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setManageShipsModal(group)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                      title="Schiffe verwalten"
                    >
                      <Anchor size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Beschreibung - feste Mindesthöhe */}
              <div className="min-h-[80px] mb-4">
                {group.description && (
                  <p className="text-gray-300 text-sm border-l-2 border-krt-orange/50 pl-3 line-clamp-4">
                    {group.description}
                  </p>
                )}
              </div>

              {/* Schiffe - feste Höhe */}
              <div className="min-h-[60px] mb-4">
                <div className="flex flex-wrap gap-1.5">
                  {group.ships.map(ship => (
                    <span
                      key={ship.id}
                      className="px-2 py-0.5 text-xs bg-gray-700/50 border border-gray-600/30 rounded"
                    >
                      {ship.ship_name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Einsatzrollen - feste Höhe */}
              <div className="min-h-[140px] mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Einsatzrollen
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.operational_roles.slice(0, 8).map(role => (
                    <div
                      key={role.id}
                      className="px-2 py-1 bg-gray-800/30 rounded text-xs"
                      title={role.description || ''}
                    >
                      <span className="text-krt-orange">{role.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mitglieder - flex-grow für Rest */}
              <div className="flex-grow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Mitglieder ({group.members.length})
                  </h3>
                  {canManage && (
                    <button
                      onClick={() => setAddMemberModal({ groupId: group.id, groupName: group.full_name })}
                      className="p-1 text-gray-400 hover:text-krt-orange hover:bg-gray-700 rounded"
                      title="Mitglied hinzufügen"
                    >
                      <UserPlus size={14} />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {(['RECRUIT', 'ACTIVE', 'INACTIVE', 'ABSENT'] as MemberStatus[]).map(status => {
                    const members = membersByStatus[status]
                    if (members.length === 0) return null
                    return (
                      <div key={status}>
                        <div className={`text-xs font-medium mb-1 ${statusColors[status]}`}>
                          {statusLabels[status]} ({members.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {members.map(member => (
                            <MemberBadge
                              key={member.id}
                              member={member}
                              status={status}
                              canManage={canManage}
                              onStatusChange={(newStatus) =>
                                updateStatusMutation.mutate({ membershipId: member.id, status: newStatus })
                              }
                              onRemove={() => removeMemberMutation.mutate(member.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Funktionsrollen */}
      {overview.function_roles.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="text-krt-orange" size={20} />
            Funktionsrollen
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {overview.function_roles.map(role => (
              <FunctionRoleCard
                key={role.id}
                role={role}
                canManage={canManage}
                onAssign={() => setAssignRoleModal({ role, type: 'function' })}
                onRemove={(assignmentId) => {
                  if (confirm('User wirklich aus dieser Rolle entfernen?')) {
                    removeFunctionRoleMutation.mutate(assignmentId)
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal: Mitglied zu KG hinzufügen */}
      {addMemberModal && (
        <Modal onClose={() => setAddMemberModal(null)} title="Mitglied hinzufügen">
          <p className="text-gray-400 mb-4">
            Zu <span className="text-krt-orange">{addMemberModal.groupName}</span> hinzufügen
          </p>
          {!allUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">User</label>
                  <select
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(parseInt(e.target.value) || null)}
                    className="input w-full"
                  >
                    <option value="">User auswählen...</option>
                    {allUsers
                      .filter(u => u.role !== 'guest' && u.role !== 'loot_guest')
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.display_name || u.username}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as MemberStatus)}
                    className="input w-full"
                  >
                    <option value="ACTIVE">Aktiv</option>
                    <option value="RECRUIT">Rekrut</option>
                    <option value="INACTIVE">Inaktiv</option>
                    <option value="ABSENT">Abwesend</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setAddMemberModal(null)} className="btn btn-secondary">
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (selectedUserId) {
                      addMemberMutation.mutate({
                        groupId: addMemberModal.groupId,
                        userId: selectedUserId,
                        status: selectedStatus,
                      })
                    }
                  }}
                  disabled={!selectedUserId || addMemberMutation.isPending}
                  className="btn btn-primary"
                >
                  {addMemberMutation.isPending ? 'Wird hinzugefügt...' : 'Hinzufügen'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Modal: User zu Rolle zuweisen */}
      {assignRoleModal && (
        <Modal
          onClose={() => { setAssignRoleModal(null); setSelectedUserId(null) }}
          title={`${assignRoleModal.role.name} zuweisen`}
        >
          {!allUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">User auswählen</label>
                  <select
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(parseInt(e.target.value) || null)}
                    className="input w-full"
                  >
                    <option value="">User auswählen...</option>
                    {allUsers
                      .filter(u => u.role !== 'guest' && u.role !== 'loot_guest')
                      .filter(u => !assignRoleModal.role.users.some(ru => ru.user.id === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.display_name || u.username}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => { setAssignRoleModal(null); setSelectedUserId(null) }} className="btn btn-secondary">
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    if (selectedUserId) {
                      assignFunctionRoleMutation.mutate({
                        userId: selectedUserId,
                        roleId: assignRoleModal.role.id,
                      })
                    }
                  }}
                  disabled={!selectedUserId || assignFunctionRoleMutation.isPending}
                  className="btn btn-primary"
                >
                  {assignFunctionRoleMutation.isPending ? 'Wird zugewiesen...' : 'Zuweisen'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Modal: KG Beschreibung bearbeiten */}
      {editGroupModal && (
        <Modal onClose={() => setEditGroupModal(null)} title={`${editGroupModal.full_name} bearbeiten`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Beschreibung</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="input w-full h-32 resize-none"
                placeholder="Beschreibung der Kommandogruppe..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditGroupModal(null)} className="btn btn-secondary">
              Abbrechen
            </button>
            <button
              onClick={() => {
                updateGroupMutation.mutate({
                  groupId: editGroupModal.id,
                  description: editDescription,
                })
              }}
              disabled={updateGroupMutation.isPending}
              className="btn btn-primary"
            >
              {updateGroupMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Schiffe verwalten */}
      {manageShipsModal && (
        <Modal onClose={() => setManageShipsModal(null)} title={`Schiffe: ${manageShipsModal.name}`}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {manageShipsModal.ships.map(ship => (
                <div
                  key={ship.id}
                  className="flex items-center gap-2 px-3 py-1 bg-gray-700/50 border border-gray-600/30 rounded-full"
                >
                  <span className="text-sm">{ship.ship_name}</span>
                  <button
                    onClick={() => {
                      if (confirm(`"${ship.ship_name}" wirklich entfernen?`)) {
                        removeShipMutation.mutate(ship.id)
                      }
                    }}
                    className="text-gray-400 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newShipName}
                onChange={(e) => setNewShipName(e.target.value)}
                className="input flex-1"
                placeholder="Neues Schiff..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newShipName.trim()) {
                    addShipMutation.mutate({
                      groupId: manageShipsModal.id,
                      shipName: newShipName.trim(),
                    })
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newShipName.trim()) {
                    addShipMutation.mutate({
                      groupId: manageShipsModal.id,
                      shipName: newShipName.trim(),
                    })
                  }
                }}
                disabled={!newShipName.trim() || addShipMutation.isPending}
                className="btn btn-primary"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button onClick={() => setManageShipsModal(null)} className="btn btn-secondary">
              Schließen
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============== Subcomponents ==============

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function LeadershipCard({
  role,
  canManage,
  onAssign,
  onRemove,
}: {
  role: FunctionRoleWithUsers
  canManage: boolean
  onAssign: () => void
  onRemove: (assignmentId: number) => void
}) {
  return (
    <div className="p-4 bg-gray-800/50 border border-gray-600/30 rounded-lg min-h-[100px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-krt-orange">{role.name}</h3>
        {canManage && (
          <button
            onClick={onAssign}
            className="p-1 text-gray-400 hover:text-krt-orange hover:bg-gray-700 rounded"
            title="User zuweisen"
          >
            <UserPlus size={16} />
          </button>
        )}
      </div>
      {role.users.length > 0 ? (
        <ul className="space-y-2">
          {role.users.map(u => (
            <li key={u.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-2 text-white">
                {u.user.avatar && (
                  <img src={u.user.avatar} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span>{u.user.display_name || u.user.username}</span>
              </div>
              {canManage && (
                <button
                  onClick={() => onRemove(u.id)}
                  className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Entfernen"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm">Nicht besetzt</p>
      )}
    </div>
  )
}

function FunctionRoleCard({
  role,
  canManage,
  onAssign,
  onRemove,
}: {
  role: FunctionRoleWithUsers
  canManage: boolean
  onAssign: () => void
  onRemove: (assignmentId: number) => void
}) {
  return (
    <div className="p-3 bg-gray-800/50 border border-gray-600/30 rounded-lg min-h-[80px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-sm text-krt-orange truncate">{role.name}</h3>
        {canManage && (
          <button
            onClick={onAssign}
            className="p-1 text-gray-400 hover:text-krt-orange hover:bg-gray-700 rounded flex-shrink-0"
            title="User zuweisen"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {role.users.length > 0 ? (
        <ul className="space-y-1">
          {role.users.map(u => (
            <li key={u.id} className="flex items-center justify-between group text-xs">
              <span className="text-gray-300 truncate">
                {u.user.display_name || u.user.username}
              </span>
              {canManage && (
                <button
                  onClick={() => onRemove(u.id)}
                  className="p-0.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Entfernen"
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">-</p>
      )}
    </div>
  )
}

function MemberBadge({
  member,
  status,
  canManage,
  onStatusChange,
  onRemove,
}: {
  member: UserCommandGroup
  status: MemberStatus
  canManage: boolean
  onStatusChange: (status: MemberStatus) => void
  onRemove: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => canManage && setShowMenu(!showMenu)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${statusColors[status]} ${
          canManage ? 'hover:bg-gray-700 cursor-pointer' : ''
        } bg-gray-800/50 border border-gray-600/30`}
      >
        {member.user.avatar && (
          <img src={member.user.avatar} alt="" className="w-3 h-3 rounded-full" />
        )}
        {member.user.display_name || member.user.username}
      </button>

      {showMenu && canManage && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-50 min-w-[140px]">
            <div className="p-2 border-b border-gray-700 text-xs text-gray-400">Status ändern</div>
            {(['ACTIVE', 'RECRUIT', 'INACTIVE', 'ABSENT'] as MemberStatus[]).map(s => (
              <button
                key={s}
                onClick={() => {
                  onStatusChange(s)
                  setShowMenu(false)
                }}
                className={`block w-full text-left px-3 py-1 text-sm hover:bg-gray-700 ${
                  s === status ? 'text-krt-orange' : statusColors[s]
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
            <div className="border-t border-gray-700">
              <button
                onClick={() => {
                  if (confirm('User wirklich aus dieser Gruppe entfernen?')) {
                    onRemove()
                  }
                  setShowMenu(false)
                }}
                className="block w-full text-left px-3 py-1 text-sm text-red-400 hover:bg-gray-700"
              >
                Entfernen
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
