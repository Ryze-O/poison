import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, ChevronDown, X, UserPlus, Search } from 'lucide-react'
import { apiClient } from '../api/client'
import type {
  AssignmentData,
  EligibleUser,
  GroupedOperationalRole,
  UnitWithPositions,
  PositionWithAssignments,
  MissionAssignment,
} from '../api/types'

interface MissionAssignmentPanelProps {
  missionId: number
}

// ============== RoleSelector ==============

interface RoleSelectorProps {
  value: { roleId: number | null; customText: string | null }
  onChange: (value: { roleId: number | null; customText: string | null }) => void
  operationalRoles: GroupedOperationalRole[]
  className?: string
}

function RoleSelector({ value, onChange, operationalRoles, className = '' }: RoleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customInput, setCustomInput] = useState(value.customText || '')
  const [showCustom, setShowCustom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Find selected role name
  const selectedRoleName = value.roleId
    ? operationalRoles
        .flatMap((g) => g.roles.map((r) => ({ ...r, groupName: g.command_group_name })))
        .find((r) => r.id === value.roleId)
    : null

  const displayText = value.customText || (selectedRoleName ? `${selectedRoleName.groupName} - ${selectedRoleName.name}` : 'Rolle wählen...')

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectRole = (roleId: number) => {
    onChange({ roleId, customText: null })
    setIsOpen(false)
    setShowCustom(false)
    setCustomInput('')
  }

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onChange({ roleId: null, customText: customInput.trim() })
      setIsOpen(false)
      setShowCustom(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-krt-dark border border-gray-600 rounded text-sm text-left hover:border-gray-500"
      >
        <span className={value.roleId || value.customText ? 'text-white' : 'text-gray-400'}>
          {displayText}
        </span>
        <ChevronDown size={16} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-72 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {/* Custom input option */}
          <div className="p-2 border-b border-gray-700">
            {showCustom ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                  placeholder="Eigene Rolle eingeben..."
                  className="flex-1 px-2 py-1 bg-krt-darker border border-gray-600 rounded text-sm text-white"
                  autoFocus
                />
                <button
                  onClick={handleCustomSubmit}
                  className="px-2 py-1 bg-krt-orange rounded text-sm hover:bg-krt-orange/80"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-2 py-1 text-gray-400 hover:text-white text-sm"
              >
                + Eigene Rolle eingeben...
              </button>
            )}
          </div>

          {/* Grouped roles */}
          {operationalRoles.map((group) => (
            <div key={group.command_group_id}>
              <div className="px-3 py-2 text-xs font-semibold text-krt-orange bg-krt-darker">
                {group.command_group_name} - {group.command_group_full}
              </div>
              {group.roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${
                    value.roleId === role.id ? 'bg-krt-orange/20 text-white' : 'text-gray-300'
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============== UserListItem ==============

interface UserListItemProps {
  user: EligibleUser
  isSelected: boolean
  onSelect: () => void
}

function UserListItem({ user, isSelected, onSelect }: UserListItemProps) {
  const [imgError, setImgError] = useState(false)

  const getRoleBadge = (u: EligibleUser) => {
    if (u.is_officer) return { text: 'Offizier', color: 'bg-yellow-600' }
    if (u.is_kg_verwalter) return { text: 'KG', color: 'bg-purple-600' }
    if (u.is_pioneer) return { text: 'Pioneer', color: 'bg-green-600' }
    return null
  }

  const badge = getRoleBadge(user)
  // Avatar ist bereits volle URL oder null
  const hasValidAvatar = user.avatar && !imgError

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 ${
        isSelected ? 'bg-krt-orange/20' : ''
      }`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
        {hasValidAvatar ? (
          <img
            src={user.avatar!}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-xs text-gray-400">
            {(user.display_name || user.username).charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">
          {user.display_name || user.username}
        </div>
        {user.display_name && user.display_name !== user.username && (
          <div className="text-xs text-gray-500 truncate">@{user.username}</div>
        )}
      </div>
      {badge && (
        <span className={`px-2 py-0.5 rounded text-xs ${badge.color}`}>{badge.text}</span>
      )}
    </button>
  )
}

// ============== UserAutocomplete ==============

interface UserAutocompleteProps {
  value: { userId: number | null; placeholder: string | null }
  onChange: (value: { userId: number | null; placeholder: string | null }) => void
  users: EligibleUser[]
  className?: string
}

function UserAutocomplete({ value, onChange, users, className = '' }: UserAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showPlaceholder, setShowPlaceholder] = useState(false)
  const [placeholderInput, setPlaceholderInput] = useState(value.placeholder || '')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Find selected user
  const selectedUser = value.userId ? users.find((u) => u.id === value.userId) : null
  const displayText =
    value.placeholder || (selectedUser ? selectedUser.display_name || selectedUser.username : '')

  // Filter users based on search
  const filteredUsers = users.filter((user) => {
    const name = (user.display_name || user.username).toLowerCase()
    return name.includes(searchTerm.toLowerCase())
  })

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowPlaceholder(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectUser = (user: EligibleUser) => {
    onChange({ userId: user.id, placeholder: null })
    setIsOpen(false)
    setSearchTerm('')
    setShowPlaceholder(false)
  }

  const handlePlaceholderSubmit = () => {
    if (placeholderInput.trim()) {
      onChange({ userId: null, placeholder: placeholderInput.trim() })
      setIsOpen(false)
      setShowPlaceholder(false)
    }
  }

  const handleClear = () => {
    onChange({ userId: null, placeholder: null })
    setSearchTerm('')
    setPlaceholderInput('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : displayText}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="User auswählen..."
          className="w-full px-3 py-2 pl-9 bg-krt-dark border border-gray-600 rounded text-sm text-white hover:border-gray-500"
        />
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        {(value.userId || value.placeholder) && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* Placeholder option */}
          <div className="p-2 border-b border-gray-700">
            {showPlaceholder ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={placeholderInput}
                  onChange={(e) => setPlaceholderInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePlaceholderSubmit()}
                  placeholder="Platzhalter (XXXXX)..."
                  className="flex-1 px-2 py-1 bg-krt-darker border border-gray-600 rounded text-sm text-white"
                  autoFocus
                />
                <button
                  onClick={handlePlaceholderSubmit}
                  className="px-2 py-1 bg-krt-orange rounded text-sm hover:bg-krt-orange/80"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPlaceholder(true)}
                className="w-full text-left px-2 py-1 text-gray-400 hover:text-white text-sm"
              >
                <UserPlus size={14} className="inline mr-2" />
                Platzhalter eingeben...
              </button>
            )}
          </div>

          {/* User list */}
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <UserListItem
                key={user.id}
                user={user}
                isSelected={value.userId === user.id}
                onSelect={() => handleSelectUser(user)}
              />
            ))
          ) : (
            <div className="px-3 py-4 text-center text-gray-400 text-sm">Keine User gefunden</div>
          )}
        </div>
      )}
    </div>
  )
}

// ============== SlotRow ==============

interface SlotRowProps {
  position: PositionWithAssignments
  assignment: MissionAssignment | null
  operationalRoles: GroupedOperationalRole[]
  users: EligibleUser[]
  missionId: number
  onUpdate: () => void
}

function SlotRow({ position, assignment, operationalRoles, users, missionId, onUpdate }: SlotRowProps) {
  const queryClient = useQueryClient()
  const [roleValue, setRoleValue] = useState<{ roleId: number | null; customText: string | null }>({
    roleId: position.required_role_id,
    customText: position.position_type,
  })
  const [userValue, setUserValue] = useState<{ userId: number | null; placeholder: string | null }>({
    userId: assignment?.user_id || null,
    placeholder: assignment?.placeholder_name || null,
  })

  // Update position (role)
  const updatePositionMutation = useMutation({
    mutationFn: async (data: { position_type?: string | null; required_role_id?: number | null }) => {
      await apiClient.patch(`/api/missions/${missionId}/positions/${position.id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-assignment-data', missionId] })
      onUpdate()
    },
  })

  // Create assignment
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: { position_id: number; user_id?: number | null; placeholder_name?: string | null }) => {
      await apiClient.post(`/api/missions/${missionId}/assignments`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-assignment-data', missionId] })
      // WICHTIG: String() weil MissionDetailPage id als String von useParams() erhält
      queryClient.invalidateQueries({ queryKey: ['mission', String(missionId)] })
      onUpdate()
    },
  })

  // Update assignment
  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { user_id?: number | null; placeholder_name?: string | null }) => {
      if (!assignment) return
      await apiClient.patch(`/api/missions/${missionId}/assignments/${assignment.id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-assignment-data', missionId] })
      // WICHTIG: String() weil MissionDetailPage id als String von useParams() erhält
      queryClient.invalidateQueries({ queryKey: ['mission', String(missionId)] })
      onUpdate()
    },
  })

  // Delete assignment
  const deleteAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!assignment) return
      await apiClient.delete(`/api/missions/${missionId}/assignments/${assignment.id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-assignment-data', missionId] })
      // WICHTIG: String() weil MissionDetailPage id als String von useParams() erhält
      queryClient.invalidateQueries({ queryKey: ['mission', String(missionId)] })
      onUpdate()
      setUserValue({ userId: null, placeholder: null })
    },
  })

  const handleRoleChange = (value: { roleId: number | null; customText: string | null }) => {
    setRoleValue(value)
    // Auto-save role changes
    updatePositionMutation.mutate({
      required_role_id: value.roleId,
      position_type: value.customText,
    })
  }

  const handleUserChange = (value: { userId: number | null; placeholder: string | null }) => {
    setUserValue(value)

    // Auto-save user changes
    if (value.userId || value.placeholder) {
      if (assignment) {
        // Update existing assignment
        updateAssignmentMutation.mutate({
          user_id: value.userId,
          placeholder_name: value.placeholder,
        })
      } else {
        // Create new assignment
        createAssignmentMutation.mutate({
          position_id: position.id,
          user_id: value.userId,
          placeholder_name: value.placeholder,
        })
      }
    } else if (assignment) {
      // Clear assignment
      deleteAssignmentMutation.mutate()
    }
  }

  const isLoading =
    updatePositionMutation.isPending ||
    createAssignmentMutation.isPending ||
    updateAssignmentMutation.isPending ||
    deleteAssignmentMutation.isPending

  return (
    <div className="grid grid-cols-2 gap-3 py-2 border-b border-gray-700 last:border-0">
      <RoleSelector
        value={roleValue}
        onChange={handleRoleChange}
        operationalRoles={operationalRoles}
        className={isLoading ? 'opacity-50' : ''}
      />
      <UserAutocomplete
        value={userValue}
        onChange={handleUserChange}
        users={users}
        className={isLoading ? 'opacity-50' : ''}
      />
    </div>
  )
}

// ============== UnitAssignmentCard ==============

interface UnitAssignmentCardProps {
  unit: UnitWithPositions
  operationalRoles: GroupedOperationalRole[]
  users: EligibleUser[]
  missionId: number
  onUpdate: () => void
}

function UnitAssignmentCard({ unit, operationalRoles, users, missionId, onUpdate }: UnitAssignmentCardProps) {
  return (
    <div className="bg-krt-dark rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-krt-darker border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-krt-orange" />
          <div>
            <div className="font-medium text-white">{unit.name}</div>
            {unit.ship_name && <div className="text-xs text-gray-400">{unit.ship_name}</div>}
          </div>
        </div>
        <div className="text-sm text-gray-400">{unit.crew_count} Plätze</div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-2 gap-3 px-4 py-2 bg-krt-darker/50 text-xs font-medium text-gray-400">
        <div>Einsatzrolle</div>
        <div>Besatzung</div>
      </div>

      {/* Slots */}
      <div className="px-4">
        {unit.positions.map((position) => (
          <SlotRow
            key={position.id}
            position={position}
            assignment={position.assignments[0] || null}
            operationalRoles={operationalRoles}
            users={users}
            missionId={missionId}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  )
}

// ============== Main Component ==============

export default function MissionAssignmentPanel({ missionId }: MissionAssignmentPanelProps) {
  const { data, isLoading, error, refetch } = useQuery<AssignmentData>({
    queryKey: ['mission-assignment-data', missionId],
    queryFn: async () => {
      const res = await apiClient.get<AssignmentData>(`/api/missions/${missionId}/assignment-data`)
      return res.data
    },
  })

  if (isLoading) {
    return (
      <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
          Lade Zuweisungsdaten...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
        <div className="text-red-400">Fehler beim Laden der Zuweisungsdaten</div>
      </div>
    )
  }

  if (!data.can_manage) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users size={20} className="text-krt-orange" />
          Besatzungszuweisung
        </h2>
      </div>

      {data.units.length === 0 ? (
        <div className="bg-krt-dark rounded-lg border border-gray-700 p-6 text-center text-gray-400">
          Keine Einheiten vorhanden. Erstelle zuerst Einheiten im Einsatz-Editor.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.units.map((unit) => (
            <UnitAssignmentCard
              key={unit.id}
              unit={unit}
              operationalRoles={data.operational_roles}
              users={data.eligible_users}
              missionId={missionId}
              onUpdate={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
