import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { Users, Shield, Anchor, Rocket, Truck, ChevronDown, ChevronRight, X, UserPlus } from 'lucide-react'
import type { StaffelOverview, User, MemberStatus, UserCommandGroup } from '../api/types'

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
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([1, 2, 3]))
  const [addMemberModal, setAddMemberModal] = useState<{ groupId: number; groupName: string } | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<MemberStatus>('ACTIVE')

  // Data fetching
  const { data: overview, isLoading } = useQuery<StaffelOverview>({
    queryKey: ['staffel', 'overview'],
    queryFn: () => apiClient.get('/api/staffel/overview').then(r => r.data),
  })

  // canManage: Admin oder KG-Verwalter (kommt vom Backend)
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

  const toggleGroup = (id: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Staffelstruktur</h1>
      </div>

      {/* Staffelleitung */}
      {overview.leadership_roles.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield className="text-krt-orange" size={24} />
            Staffelleitung
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {overview.leadership_roles.map(role => (
              <div key={role.id} className="p-4 bg-gray-800/50 border border-gray-600/30 rounded-lg">
                <h3 className="font-bold text-krt-orange mb-2">{role.name}</h3>
                {role.users.length > 0 ? (
                  <ul className="space-y-1">
                    {role.users.map(u => (
                      <li key={u.id} className="text-white flex items-center gap-2">
                        {u.user.avatar && (
                          <img src={u.user.avatar} alt="" className="w-5 h-5 rounded-full" />
                        )}
                        {u.user.display_name || u.user.username}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm">Nicht besetzt</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kommandogruppen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {overview.command_groups.map(group => {
          const Icon = kgIcons[group.name] || Users
          const isExpanded = expandedGroups.has(group.id)
          const membersByStatus = {
            RECRUIT: group.members.filter(m => m.status === 'RECRUIT'),
            ACTIVE: group.members.filter(m => m.status === 'ACTIVE'),
            INACTIVE: group.members.filter(m => m.status === 'INACTIVE'),
            ABSENT: group.members.filter(m => m.status === 'ABSENT'),
          }

          return (
            <div key={group.id} className="card">
              {/* Header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center gap-3">
                  <Icon className="text-krt-orange" size={28} />
                  <div>
                    <h2 className="text-xl font-bold">{group.name}</h2>
                    <p className="text-sm text-gray-400">{group.full_name}</p>
                  </div>
                </div>
                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>

              {/* Schiffe */}
              <div className="flex flex-wrap gap-2 mt-4">
                {group.ships.map(ship => (
                  <span
                    key={ship.id}
                    className="px-2 py-1 text-xs bg-gray-700/50 border border-gray-600/30 rounded"
                  >
                    {ship.ship_name}
                  </span>
                ))}
              </div>

              {/* Beschreibung */}
              {isExpanded && group.description && (
                <p className="text-sm text-gray-400 mt-4 border-l-2 border-krt-orange/50 pl-3">
                  {group.description}
                </p>
              )}

              {/* Einsatzrollen */}
              {isExpanded && group.operational_roles.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Einsatzrollen
                  </h3>
                  <div className="space-y-2">
                    {group.operational_roles.map(role => (
                      <div
                        key={role.id}
                        className="p-2 bg-gray-800/30 rounded text-sm"
                      >
                        <div className="font-medium text-gray-200">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-gray-500 mt-1">{role.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mitglieder */}
              {isExpanded && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                      Mitglieder ({group.members.length})
                    </h3>
                    {canManage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setAddMemberModal({ groupId: group.id, groupName: group.full_name })
                        }}
                        className="btn btn-sm btn-secondary flex items-center gap-1"
                      >
                        <UserPlus size={14} />
                        Hinzufügen
                      </button>
                    )}
                  </div>

                  {/* Mitglieder nach Status gruppiert */}
                  <div className="space-y-3">
                    {(['RECRUIT', 'ACTIVE', 'INACTIVE', 'ABSENT'] as MemberStatus[]).map(status => {
                      const members = membersByStatus[status]
                      if (members.length === 0) return null
                      return (
                        <div key={status}>
                          <div className={`text-xs font-medium mb-1 ${statusColors[status]}`}>
                            {statusLabels[status]} ({members.length})
                          </div>
                          <div className="flex flex-wrap gap-2">
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
              )}
            </div>
          )
        })}
      </div>

      {/* Funktionsrollen */}
      {overview.function_roles.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="text-krt-orange" size={24} />
            Funktionsrollen
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {overview.function_roles.map(role => (
              <div
                key={role.id}
                className="p-3 bg-gray-800/50 border border-gray-600/30 rounded-lg"
              >
                <h3 className="font-medium text-sm text-krt-orange mb-2">{role.name}</h3>
                {role.users.length > 0 ? (
                  <ul className="space-y-1">
                    {role.users.map(u => (
                      <li key={u.id} className="text-xs text-gray-300">
                        {u.user.display_name || u.user.username}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">-</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal && allUsers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Mitglied hinzufügen</h2>
              <button onClick={() => setAddMemberModal(null)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <p className="text-gray-400 mb-4">
              Zu <span className="text-krt-orange">{addMemberModal.groupName}</span> hinzufügen
            </p>

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
          </div>
        </div>
      )}
    </div>
  )
}

// Member Badge Component
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
        className={`flex items-center gap-1 px-2 py-1 rounded text-sm ${statusColors[status]} ${
          canManage ? 'hover:bg-gray-700 cursor-pointer' : ''
        } bg-gray-800/50 border border-gray-600/30`}
      >
        {member.user.avatar && (
          <img src={member.user.avatar} alt="" className="w-4 h-4 rounded-full" />
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
