import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import {
  Users, Shield, Anchor, Rocket, Truck, X,
  Grid3X3, UserCheck, Volume2, VolumeX, ChevronDown, ChevronUp,
  Crown, Star
} from 'lucide-react'
import type {
  StaffelOverview, User, MemberStatus, CommandGroupDetail,
  MyCommandGroupsResponse
} from '../api/types'

// KG Icons
const kgIcons: Record<string, typeof Shield> = {
  CW: Anchor,
  SW: Rocket,
  P: Truck,
}

// Musik-Pfad - WAV-Datei hier ablegen: frontend/public/assets/music/ambient.wav
const BACKGROUND_MUSIC_PATH = '/assets/music/ambient.wav'

export default function StaffelstrukturPage() {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [expandedKG, setExpandedKG] = useState<number | null>(null)

  // Self-Service Modal
  const [selfServiceModal, setSelfServiceModal] = useState(false)
  const [selectedKGs, setSelectedKGs] = useState<number[]>([])

  // Data fetching
  const { data: overview, isLoading } = useQuery<StaffelOverview>({
    queryKey: ['staffel', 'overview'],
    queryFn: () => apiClient.get('/api/staffel/overview').then(r => r.data),
  })

  const canManage = overview?.can_manage ?? false

  // Self-Service: Eigene KG-Mitgliedschaften
  const { data: myKGs } = useQuery<MyCommandGroupsResponse>({
    queryKey: ['staffel', 'my-command-groups'],
    queryFn: () => apiClient.get('/api/staffel/my-command-groups').then(r => r.data),
  })

  // Audio Setup - startet automatisch
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.15
      audioRef.current.loop = true
      // Autoplay versuchen (Browser kann blockieren)
      audioRef.current.play().catch(() => {
        // Falls Browser blockiert, setze auf muted
        setIsMuted(true)
      })
    }
  }, [])

  const toggleMusic = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.play().catch(() => {})
      } else {
        audioRef.current.pause()
      }
      setIsMuted(!isMuted)
    }
  }

  // Self-Service Mutation
  const setMyKGsMutation = useMutation({
    mutationFn: (command_group_ids: number[]) =>
      apiClient.post('/api/staffel/my-command-groups', { command_group_ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffel'] })
      setSelfServiceModal(false)
      setSelectedKGs([])
    },
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
    <div className="space-y-8">
      {/* Background Music */}
      <audio ref={audioRef} src={BACKGROUND_MUSIC_PATH} preload="auto" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Staffelstruktur</h1>
          <p className="text-gray-400 mt-1">Organisation der Staffel Viper</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Musik Toggle */}
          <button
            onClick={toggleMusic}
            className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
            title={isMuted ? 'Musik einschalten' : 'Musik ausschalten'}
          >
            {isMuted ? (
              <VolumeX size={20} className="text-gray-400" />
            ) : (
              <Volume2 size={20} className="text-krt-orange" />
            )}
          </button>

          {/* Self-Service Button */}
          {myKGs?.can_self_assign && (
            <button
              onClick={() => {
                setSelectedKGs([])
                setSelfServiceModal(true)
              }}
              className="btn btn-primary flex items-center gap-2"
            >
              <UserCheck size={18} />
              Für KGs anmelden
            </button>
          )}
        </div>
      </div>

      {/* Staffelleitung */}
      {overview.leadership_roles.length > 0 && (
        <div className="bg-gradient-to-r from-krt-orange/10 to-transparent border border-krt-orange/30 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Crown className="text-krt-orange" size={24} />
            Staffelleitung
          </h2>
          <div className="flex flex-wrap gap-6">
            {overview.leadership_roles.map(role => (
              <div key={role.id} className="flex items-center gap-3">
                <div className="text-sm text-gray-400">{role.name}:</div>
                {role.users.length > 0 ? (
                  role.users.map(u => (
                    <div key={u.id} className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-lg">
                      {u.user.avatar && (
                        <img src={u.user.avatar} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      <span className="font-medium">{u.user.display_name || u.user.username}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-gray-500 italic">Nicht besetzt</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kommandogruppen */}
      <div className="space-y-6">
        {overview.command_groups.map(group => (
          <KommandogruppeCard
            key={group.id}
            group={group}
            canManage={canManage}
            isExpanded={expandedKG === group.id}
            onToggleExpand={() => setExpandedKG(expandedKG === group.id ? null : group.id)}
          />
        ))}
      </div>

      {/* Funktionsrollen */}
      {overview.function_roles.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Star className="text-krt-orange" size={24} />
            Funktionsrollen
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {overview.function_roles.map(role => (
              <div key={role.id} className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-sm font-medium text-krt-orange mb-2">{role.name}</div>
                {role.users.length > 0 ? (
                  <div className="space-y-1">
                    {role.users.map(u => (
                      <div key={u.id} className="text-sm text-gray-300">
                        {u.user.display_name || u.user.username}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic">Nicht besetzt</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Self-Service Modal */}
      {selfServiceModal && (
        <Modal onClose={() => setSelfServiceModal(false)} title="Für Kommandogruppen anmelden">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Wähle die Kommandogruppen aus, die dich interessieren.
            </p>
            <p className="text-xs text-yellow-500 bg-yellow-900/20 px-3 py-2 rounded border border-yellow-700/30">
              Diese Auswahl kann nur einmal getroffen werden.
            </p>
            <div className="space-y-3">
              {overview.command_groups.map(group => {
                const Icon = kgIcons[group.name] || Users
                const isSelected = selectedKGs.includes(group.id)
                return (
                  <label
                    key={group.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-krt-orange/10 border-krt-orange'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedKGs([...selectedKGs, group.id])
                        } else {
                          setSelectedKGs(selectedKGs.filter(id => id !== group.id))
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-krt-orange focus:ring-krt-orange"
                    />
                    <Icon size={20} className={isSelected ? 'text-krt-orange' : 'text-gray-400'} />
                    <div className="flex-1">
                      <div className="font-medium">{group.full_name}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setSelfServiceModal(false)} className="btn btn-secondary">
              Abbrechen
            </button>
            <button
              onClick={() => setMyKGsMutation.mutate(selectedKGs)}
              disabled={selectedKGs.length === 0 || setMyKGsMutation.isPending}
              className="btn btn-primary"
            >
              {setMyKGsMutation.isPending ? 'Wird gespeichert...' : 'Anmelden'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============== Kommandogruppe Card ==============

function KommandogruppeCard({
  group,
  canManage,
  isExpanded,
  onToggleExpand,
}: {
  group: CommandGroupDetail
  canManage: boolean
  isExpanded: boolean
  onToggleExpand: () => void
}) {
  const Icon = kgIcons[group.name] || Users

  // Mitglieder nach Status gruppieren
  const activeMembers = group.members.filter(m => m.status === 'ACTIVE')
  const recruits = group.members.filter(m => m.status === 'RECRUIT')
  const inactive = group.members.filter(m => m.status === 'INACTIVE' || m.status === 'ABSENT')

  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-b from-gray-800/50 to-gray-900/50 border border-gray-700/50">
      {/* Header mit GIF */}
      <div className="relative h-40 bg-gradient-to-r from-gray-900 to-gray-800 overflow-hidden">
        {/* GIF Background - Pfad: frontend/public/assets/kg/cw.gif, sw.gif, p.gif */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{ backgroundImage: `url(/assets/kg/${group.name.toLowerCase()}.gif)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />

        {/* KG Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-krt-orange/20 border border-krt-orange/50 flex items-center justify-center backdrop-blur-sm">
              <Icon size={32} className="text-krt-orange" />
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-wide">{group.name}</h3>
              <p className="text-sm text-gray-300">{group.full_name}</p>
            </div>
          </div>

          {/* Matrix Button für Manager */}
          {canManage && (
            <Link
              to={`/struktur/matrix?kg=${group.id}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-krt-orange hover:bg-krt-orange/80 rounded-lg transition-colors shadow-lg"
            >
              <Grid3X3 size={18} />
              <span className="font-medium">Rollen-Matrix</span>
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-5">
        {/* Beschreibung */}
        {group.description && (
          <p className="text-sm text-gray-400 leading-relaxed">{group.description}</p>
        )}

        {/* Schiffe */}
        {group.ships.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {group.ships.map(ship => (
              <span
                key={ship.id}
                className="px-3 py-1.5 bg-gray-800/70 rounded-lg text-sm text-gray-300 border border-gray-700/50"
              >
                {ship.ship_name}
              </span>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-800/40 rounded-xl p-4 text-center border border-gray-700/30">
            <div className="text-3xl font-bold text-white">{activeMembers.length}</div>
            <div className="text-xs text-gray-500 mt-1">Aktive Mitglieder</div>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-4 text-center border border-gray-700/30">
            <div className="text-3xl font-bold text-krt-orange">{recruits.length}</div>
            <div className="text-xs text-gray-500 mt-1">Rekruten</div>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-4 text-center border border-gray-700/30">
            <div className="text-3xl font-bold text-white">{group.operational_roles.length}</div>
            <div className="text-xs text-gray-500 mt-1">Einsatzrollen</div>
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <button
          onClick={onToggleExpand}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-400 hover:text-white transition-colors border-t border-gray-700/50 -mx-5 px-5 mt-5"
          style={{ width: 'calc(100% + 2.5rem)' }}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={18} />
              Details ausblenden
            </>
          ) : (
            <>
              <ChevronDown size={18} />
              Mitglieder & Einsatzrollen anzeigen
            </>
          )}
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-6 pt-2">
            {/* Mitglieder */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Users size={16} className="text-krt-orange" />
                Mitglieder ({group.members.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {activeMembers.map(m => (
                  <MemberBadge key={m.id} member={m} />
                ))}
                {recruits.map(m => (
                  <MemberBadge key={m.id} member={m} isRecruit />
                ))}
              </div>
              {inactive.length > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  + {inactive.length} inaktiv/abwesend
                </div>
              )}
            </div>

            {/* Einsatzrollen Übersicht */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Shield size={16} className="text-krt-orange" />
                Einsatzrollen
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.operational_roles.map(role => {
                  const assignedCount = role.users.length
                  const trainingCount = role.users.filter(u => u.is_training).length
                  return (
                    <div
                      key={role.id}
                      className="bg-gray-800/40 rounded-lg p-4 border border-gray-700/30"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-medium text-white">{role.name}</div>
                        <div className="flex items-center gap-1 bg-gray-700/50 px-2 py-0.5 rounded text-sm">
                          <span className="font-bold text-krt-orange">{assignedCount}</span>
                          {trainingCount > 0 && (
                            <span className="text-yellow-500">({trainingCount}A)</span>
                          )}
                        </div>
                      </div>
                      {role.description && (
                        <div className="text-xs text-gray-500">{role.description}</div>
                      )}
                      {/* Zugewiesene User kompakt */}
                      {role.users.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {role.users.slice(0, 5).map(u => (
                            <span
                              key={u.id}
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                u.is_training
                                  ? 'bg-yellow-900/30 text-yellow-400'
                                  : 'bg-gray-700/50 text-gray-400'
                              }`}
                            >
                              {u.user.display_name || u.user.username}
                            </span>
                          ))}
                          {role.users.length > 5 && (
                            <span className="text-xs text-gray-500">+{role.users.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============== Member Badge ==============

function MemberBadge({
  member,
  isRecruit = false
}: {
  member: { user: User; status: MemberStatus }
  isRecruit?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
        isRecruit
          ? 'bg-krt-orange/15 border border-krt-orange/40 text-krt-orange'
          : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
      }`}
    >
      {member.user.avatar && (
        <img src={member.user.avatar} alt="" className="w-5 h-5 rounded-full" />
      )}
      <span>{member.user.display_name || member.user.username}</span>
    </div>
  )
}

// ============== Modal ==============

function Modal({
  children,
  onClose,
  title
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
