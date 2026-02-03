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
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(0.3)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
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
      audioRef.current.volume = volume
      audioRef.current.loop = true
      // Autoplay versuchen (Browser kann blockieren)
      audioRef.current.play().catch(() => {
        // Falls Browser blockiert, setze auf muted
        setIsMuted(true)
      })
    }
  }, [])

  // Volume ändern
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

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
          {/* Musik Toggle mit Volume Slider */}
          <div
            className="relative"
            onMouseEnter={() => {
              if (volumeTimeoutRef.current) {
                clearTimeout(volumeTimeoutRef.current)
                volumeTimeoutRef.current = null
              }
              setShowVolumeSlider(true)
            }}
            onMouseLeave={() => {
              volumeTimeoutRef.current = setTimeout(() => {
                setShowVolumeSlider(false)
              }, 300)
            }}
          >
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

            {/* Volume Slider Popup - pt-2 schließt die Lücke zum Button */}
            {showVolumeSlider && !isMuted && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2">
                <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
                  <div className="flex flex-col items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-krt-orange"
                    />
                    <span className="text-xs text-gray-400">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

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

      {/* Kommandogruppen - nebeneinander: CW links, SW mitte, P rechts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Sortieren: CW=1, SW=2, P=3 */}
        {[...overview.command_groups]
          .sort((a, b) => {
            const order: Record<string, number> = { CW: 1, SW: 2, P: 3 }
            return (order[a.name] || 99) - (order[b.name] || 99)
          })
          .map(group => (
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
              <div key={role.id} className="bg-gray-800/30 rounded-lg p-4">
                <div className="text-sm font-medium text-krt-orange mb-3">{role.name}</div>
                {role.users.length > 0 ? (
                  <div className="space-y-2">
                    {role.users.map(u => (
                      <div key={u.id} className="flex items-center gap-2">
                        {u.user.avatar ? (
                          <img src={u.user.avatar} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                            {(u.user.display_name || u.user.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-gray-300">
                          {u.user.display_name || u.user.username}
                        </span>
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

  // User-IDs die "in Ausbildung" sind (mindestens eine Rolle mit is_training)
  const usersInTraining = new Set(
    group.operational_roles.flatMap(role =>
      role.users.filter(u => u.is_training).map(u => u.user.id)
    )
  )

  // Mitglieder nach Status gruppieren
  // Rekruten = Status RECRUIT ODER mindestens eine Ausbildungsrolle
  const activeMembers = group.members.filter(m =>
    m.status === 'ACTIVE' && !usersInTraining.has(m.user.id)
  )
  const recruits = group.members.filter(m =>
    m.status === 'RECRUIT' || usersInTraining.has(m.user.id)
  )
  const inactive = group.members.filter(m => m.status === 'INACTIVE' || m.status === 'ABSENT')

  // KG-Leitung aus Einsatzrollen finden (nur exakt "KG-Leiter" und "Stellv. KG-Leiter")
  const leadershipRoles = group.operational_roles.filter(role =>
    role.name === 'KG-Leiter' || role.name === 'Stellv. KG-Leiter'
  )
  const kgLeaders = leadershipRoles.flatMap(role =>
    role.users.map(u => ({ ...u, roleName: role.name }))
  )

  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-b from-gray-800/50 to-gray-900/50 border border-gray-700/50 flex flex-col">
      {/* Header mit GIF - kompakter für 3-Spalten */}
      <div className="relative h-32 bg-gradient-to-r from-gray-900 to-gray-800 overflow-hidden flex-shrink-0">
        {/* GIF Background - Pfad: frontend/public/assets/kg/cw.gif, sw.gif, p.gif */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{ backgroundImage: `url(/assets/kg/${group.name.toLowerCase()}.gif)` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />

        {/* KG Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-krt-orange/20 border border-krt-orange/50 flex items-center justify-center backdrop-blur-sm">
              <Icon size={26} className="text-krt-orange" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-bold tracking-wide">{group.name}</h3>
              <p className="text-xs text-gray-300 truncate">{group.full_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Matrix Button für Manager */}
        {canManage && (
          <Link
            to={`/struktur/matrix?kg=${group.id}`}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-krt-orange/20 hover:bg-krt-orange/30 border border-krt-orange/50 rounded-lg transition-colors text-sm text-krt-orange"
          >
            <Grid3X3 size={16} />
            <span className="font-medium">Rollen-Matrix</span>
          </Link>
        )}

        {/* Beschreibung */}
        {group.description && (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{group.description}</p>
        )}

        {/* Schiffe - kompakter */}
        {group.ships.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {group.ships.map(ship => (
              <span
                key={ship.id}
                className="px-2 py-1 bg-gray-800/70 rounded text-xs text-gray-300 border border-gray-700/50"
              >
                {ship.ship_name}
              </span>
            ))}
          </div>
        )}

        {/* KG-Leitung - kompakt */}
        {kgLeaders.length > 0 && (
          <div className="bg-gradient-to-r from-krt-orange/10 to-transparent border border-krt-orange/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Crown size={14} className="text-krt-orange" />
              <span className="text-xs text-gray-400 font-medium">Leitung</span>
            </div>
            <div className="space-y-1.5">
              {kgLeaders.map(leader => (
                <div key={`${leader.id}-${leader.roleName}`} className="flex items-center gap-2">
                  {leader.user.avatar ? (
                    <img src={leader.user.avatar} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-400">
                      {(leader.user.display_name || leader.user.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-white flex-1 truncate">
                    {leader.user.display_name || leader.user.username}
                  </span>
                  <span className="text-[10px] text-gray-500">{leader.roleName.replace('Stellv. ', 'Stv. ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats - kompakter für 3-Spalten-Layout */}
        <div className="flex justify-between gap-2">
          <div className="flex-1 bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
            <div className="text-2xl font-bold text-white">{activeMembers.length}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Aktiv</div>
          </div>
          <div className="flex-1 bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
            <div className="text-2xl font-bold text-krt-orange">{recruits.length}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Rekruten</div>
          </div>
          <div className="flex-1 bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/30">
            <div className="text-2xl font-bold text-white">{group.operational_roles.length}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Rollen</div>
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <button
          onClick={onToggleExpand}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400 hover:text-white transition-colors border-t border-gray-700/50 -mx-4 px-4 mt-auto"
          style={{ width: 'calc(100% + 2rem)' }}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={16} />
              Ausblenden
            </>
          ) : (
            <>
              <ChevronDown size={16} />
              Details anzeigen
            </>
          )}
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-2">
            {/* Mitglieder */}
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-2">
                <Users size={14} className="text-krt-orange" />
                Mitglieder ({group.members.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {activeMembers.map(m => (
                  <MemberBadge key={m.id} member={m} />
                ))}
                {recruits.map(m => (
                  <MemberBadge key={m.id} member={m} isRecruit />
                ))}
              </div>
              {inactive.length > 0 && (
                <div className="mt-2 text-[10px] text-gray-500">
                  + {inactive.length} inaktiv/abwesend
                </div>
              )}
            </div>

            {/* Einsatzrollen Übersicht */}
            <div>
              <h4 className="text-xs font-semibold text-gray-300 mb-2 flex items-center gap-2">
                <Shield size={14} className="text-krt-orange" />
                Einsatzrollen
              </h4>
              <div className="space-y-2">
                {group.operational_roles.map(role => {
                  const assignedCount = role.users.length
                  const trainingCount = role.users.filter(u => u.is_training).length
                  return (
                    <div
                      key={role.id}
                      className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium text-white truncate">{role.name}</div>
                        <div className="flex items-center gap-1 bg-gray-700/50 px-1.5 py-0.5 rounded text-xs flex-shrink-0">
                          <span className="font-bold text-krt-orange">{assignedCount}</span>
                          {trainingCount > 0 && (
                            <span className="text-yellow-500">({trainingCount}A)</span>
                          )}
                        </div>
                      </div>
                      {/* Zugewiesene User kompakt */}
                      {role.users.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {role.users.map(u => (
                            <span
                              key={u.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                u.is_training
                                  ? 'bg-yellow-900/30 text-yellow-400'
                                  : 'bg-gray-700/50 text-gray-400'
                              }`}
                            >
                              {u.user.display_name || u.user.username}
                            </span>
                          ))}
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
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
        isRecruit
          ? 'bg-krt-orange/15 border border-krt-orange/40 text-krt-orange'
          : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
      }`}
    >
      {member.user.avatar && (
        <img src={member.user.avatar} alt="" className="w-4 h-4 rounded-full" />
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
