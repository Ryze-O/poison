import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Shield,
  Edit3,
  Copy,
  Check,
  Lock,
  CheckCircle,
  UserPlus,
  UserMinus,
  Radio,
  AlertCircle,
} from 'lucide-react'
import type {
  MissionDetail,
  MissionStatus,
  Briefing,
  User,
} from '../api/types'

const STATUS_LABELS: Record<MissionStatus, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  locked: 'Gesperrt',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Abgesagt',
}

const STATUS_COLORS: Record<MissionStatus, string> = {
  draft: 'bg-gray-500',
  published: 'bg-green-500',
  locked: 'bg-yellow-500',
  active: 'bg-blue-500',
  completed: 'bg-gray-400',
  cancelled: 'bg-red-500',
}

type TabType = 'overview' | 'units' | 'participants' | 'briefing'

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [copied, setCopied] = useState(false)
  const [registrationNote, setRegistrationNote] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null)

  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const currentUser = useAuthStore.getState().user

  const { data: mission, isLoading } = useQuery<MissionDetail>({
    queryKey: ['mission', id],
    queryFn: () => apiClient.get(`/api/missions/${id}`).then((r) => r.data),
  })

  const { data: briefing } = useQuery<Briefing>({
    queryKey: ['mission', id, 'briefing'],
    queryFn: () => apiClient.get(`/api/missions/${id}/briefing`).then((r) => r.data),
    enabled: activeTab === 'briefing',
  })

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
    enabled: activeTab === 'participants',
  })

  const isOwner = mission?.created_by_id === currentUser?.id
  const canManage = effectiveRole === 'admin' || isOwner

  // Mutations
  const registerMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/missions/${id}/register`, {
        preferred_unit_id: selectedUnitId,
        preferred_position_id: selectedPositionId,
        availability_note: registrationNote || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })

  const unregisterMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/missions/${id}/register`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/missions/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })

  const lockMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/missions/${id}/lock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/missions/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const copyBriefingToClipboard = () => {
    if (!briefing) return

    let text = `═══════════════════════════════════════\n`
    text += `${briefing.title.toUpperCase()}\n`
    text += `${formatDate(briefing.scheduled_date)}\n`
    text += `═══════════════════════════════════════\n\n`

    text += `PRE-BRIEFING\n`
    text += `───────────────────────────────────────\n`
    if (briefing.start_location) text += `• Treffpunkt: ${briefing.start_location}\n`
    if (briefing.equipment_level) text += `• Ausrüstung: ${briefing.equipment_level}\n`
    if (briefing.target_group) text += `• Zielgruppe: ${briefing.target_group}\n`
    if (briefing.rules_of_engagement) text += `• ROE: ${briefing.rules_of_engagement}\n`
    text += `\n`

    // Strukturierte Beschreibung
    if (briefing.mission_context) {
      text += `HINTERGRUND\n`
      text += `───────────────────────────────────────\n`
      text += `${briefing.mission_context}\n\n`
    }

    if (briefing.mission_objective) {
      text += `EINSATZZIEL\n`
      text += `───────────────────────────────────────\n`
      text += `${briefing.mission_objective}\n\n`
    }

    if (briefing.preparation_notes) {
      text += `VORBEREITUNG\n`
      text += `───────────────────────────────────────\n`
      text += `${briefing.preparation_notes}\n\n`
    }

    if (briefing.special_notes) {
      text += `⚠️ BESONDERE HINWEISE\n`
      text += `───────────────────────────────────────\n`
      text += `${briefing.special_notes}\n\n`
    }

    if (briefing.phases.length > 0) {
      text += `ABLAUF\n`
      text += `───────────────────────────────────────\n`
      briefing.phases.forEach((phase) => {
        text += `\n${phase.title}${phase.start_time ? ` (${phase.start_time})` : ''}\n`
        if (phase.description) text += `${phase.description}\n`
      })
      text += `\n`
    }

    text += `LINE-UP\n`
    text += `───────────────────────────────────────\n`
    briefing.units.forEach((unit) => {
      text += `\n${unit.name.toUpperCase()}${unit.ship_name ? ` (${unit.ship_name})` : ''}\n`
      unit.positions.forEach((pos) => {
        const assigned = pos.assigned.length > 0 ? pos.assigned.join(', ') : '—'
        text += `  ${pos.name}: ${assigned}\n`
      })
    })

    if (briefing.frequency_table.length > 0) {
      text += `\nFUNKFREQUENZEN\n`
      text += `───────────────────────────────────────\n`
      briefing.frequency_table.forEach((row) => {
        const entries = Object.entries(row)
          .filter(([k]) => k !== 'unit')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')
        text += `${row.unit}: ${entries}\n`
      })
    }

    if (briefing.placeholders_used.length > 0) {
      text += `\n───────────────────────────────────────\n`
      text += `Platzhalter: ${briefing.placeholders_used.join(', ')}\n`
    }

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const myRegistration = mission?.registrations.find((r) => r.user_id === currentUser?.id)
  const isRegistered = !!myRegistration

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400">Lade Einsatz...</div>
  }

  if (!mission) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400 mb-4">Einsatz nicht gefunden</p>
        <Link to="/einsaetze" className="text-krt-orange hover:underline">
          Zurück zur Übersicht
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/einsaetze"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          Zurück zur Übersicht
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{mission.title}</h1>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[mission.status]} text-white`}
              >
                {STATUS_LABELS[mission.status]}
              </span>
            </div>
            <div className="flex items-center gap-4 text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>{formatDate(mission.scheduled_date)}</span>
              </div>
              {mission.duration_minutes && (
                <span>
                  ca. {Math.floor(mission.duration_minutes / 60)}h{' '}
                  {mission.duration_minutes % 60 > 0 && `${mission.duration_minutes % 60}min`}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {canManage && (
              <Link
                to={`/einsaetze/${id}/bearbeiten`}
                className="flex items-center gap-2 px-3 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700"
              >
                <Edit3 size={16} />
                Bearbeiten
              </Link>
            )}
            {canManage && mission.status === 'draft' && (
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
              >
                Veröffentlichen
              </button>
            )}
            {canManage && mission.status === 'published' && (
              <button
                onClick={() => lockMutation.mutate()}
                disabled={lockMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                <Lock size={16} />
                Sperren
              </button>
            )}
            {canManage && mission.status === 'locked' && (
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle size={16} />
                Abschließen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700 mb-6">
        <nav className="flex gap-4">
          {(['overview', 'units', 'participants', 'briefing'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-krt-orange text-krt-orange'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'overview' && 'Übersicht'}
              {tab === 'units' && 'Einheiten'}
              {tab === 'participants' && `Teilnehmer (${mission.registrations.length})`}
              {tab === 'briefing' && 'Briefing'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Pre-Briefing */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Voraussetzungen</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {mission.start_location_name && (
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-krt-orange mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-400">Treffpunkt</div>
                    <div>{mission.start_location_name}</div>
                  </div>
                </div>
              )}
              {mission.equipment_level && (
                <div className="flex items-start gap-3">
                  <Shield size={20} className="text-krt-orange mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-400">Ausrüstung</div>
                    <div>{mission.equipment_level}</div>
                  </div>
                </div>
              )}
              {mission.target_group && (
                <div className="flex items-start gap-3">
                  <Users size={20} className="text-krt-orange mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-400">Zielgruppe</div>
                    <div>{mission.target_group}</div>
                  </div>
                </div>
              )}
              {mission.rules_of_engagement && (
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-krt-orange mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-400">Rules of Engagement</div>
                    <div>{mission.rules_of_engagement}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Strukturierte Beschreibung */}
          {(mission.mission_context || mission.mission_objective || mission.preparation_notes || mission.special_notes) && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Beschreibung</h2>
              <div className="space-y-4">
                {mission.mission_context && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Hintergrund</div>
                    <div className="whitespace-pre-wrap">{mission.mission_context}</div>
                  </div>
                )}
                {mission.mission_objective && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Einsatzziel</div>
                    <div className="whitespace-pre-wrap font-medium text-krt-orange">{mission.mission_objective}</div>
                  </div>
                )}
                {mission.preparation_notes && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Vorbereitung</div>
                    <div className="whitespace-pre-wrap">{mission.preparation_notes}</div>
                  </div>
                )}
                {mission.special_notes && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                    <div className="text-sm text-yellow-500 mb-1 flex items-center gap-2">
                      <AlertCircle size={16} />
                      Besondere Hinweise
                    </div>
                    <div className="whitespace-pre-wrap text-yellow-100">{mission.special_notes}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Phasen */}
          {mission.phases.length > 0 && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Ablauf</h2>
              <div className="space-y-4">
                {mission.phases
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((phase) => (
                    <div key={phase.id} className="border-l-2 border-krt-orange pl-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{phase.title}</span>
                        {phase.start_time && (
                          <span className="text-sm text-gray-400">({phase.start_time})</span>
                        )}
                      </div>
                      {phase.description && (
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">
                          {phase.description}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Registration */}
          {mission.status === 'published' && currentUser && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Anmeldung</h2>
              {isRegistered ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-400">
                    <Check size={20} />
                    <span>Du bist für diesen Einsatz angemeldet</span>
                  </div>
                  {myRegistration?.availability_note && (
                    <p className="text-sm text-gray-400">
                      Hinweis: {myRegistration.availability_note}
                    </p>
                  )}
                  <button
                    onClick={() => unregisterMutation.mutate()}
                    disabled={unregisterMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    <UserMinus size={16} />
                    Abmelden
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Bevorzugte Einheit (optional)
                      </label>
                      <select
                        value={selectedUnitId || ''}
                        onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                      >
                        <option value="">Keine Präferenz</option>
                        {mission.units.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Bevorzugte Position (optional)
                      </label>
                      <select
                        value={selectedPositionId || ''}
                        onChange={(e) =>
                          setSelectedPositionId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                        disabled={!selectedUnitId}
                      >
                        <option value="">Keine Präferenz</option>
                        {selectedUnitId &&
                          mission.units
                            .find((u) => u.id === selectedUnitId)
                            ?.positions.map((pos) => (
                              <option key={pos.id} value={pos.id}>
                                {pos.name}
                              </option>
                            ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Verfügbarkeits-Hinweis (optional)
                    </label>
                    <input
                      type="text"
                      value={registrationNote}
                      onChange={(e) => setRegistrationNote(e.target.value)}
                      placeholder="z.B. 'Kann ab 20:15'"
                      className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <button
                    onClick={() => registerMutation.mutate()}
                    disabled={registerMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80 disabled:opacity-50"
                  >
                    <UserPlus size={16} />
                    Anmelden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'units' && (
        <div className="grid gap-4 md:grid-cols-2">
          {mission.units
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((unit) => (
              <div key={unit.id} className="bg-krt-dark rounded-lg border border-gray-700 p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{unit.name}</h3>
                    {unit.ship_name && (
                      <span className="text-sm text-gray-400">{unit.ship_name}</span>
                    )}
                  </div>
                  {unit.radio_frequencies && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Radio size={14} />
                      {Object.values(unit.radio_frequencies).slice(0, 2).join(', ')}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {unit.positions
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((pos) => (
                      <div
                        key={pos.id}
                        className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0"
                      >
                        <div>
                          <span className={pos.is_required ? '' : 'text-gray-400'}>
                            {pos.name}
                          </span>
                          {pos.max_count > 1 && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({pos.assignments.length}/{pos.max_count})
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          {pos.assignments.length > 0 ? (
                            pos.assignments.map((a) => (
                              <div key={a.id} className="text-sm">
                                {a.user?.display_name || a.user?.username || a.placeholder_name}
                                {a.is_training && (
                                  <span className="text-yellow-400 ml-1">(i.A.)</span>
                                )}
                                {a.is_backup && (
                                  <span className="text-gray-400 ml-1">(Backup)</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {activeTab === 'participants' && (
        <div className="space-y-6">
          {/* Registrations */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
            <h2 className="text-lg font-semibold mb-4">
              Anmeldungen ({mission.registrations.length})
            </h2>
            {mission.registrations.length > 0 ? (
              <div className="space-y-2">
                {mission.registrations.map((reg) => (
                  <div
                    key={reg.id}
                    className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {reg.user?.avatar ? (
                        <img
                          src={`https://cdn.discordapp.com/avatars/${reg.user.discord_id}/${reg.user.avatar}.png`}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                          {(reg.user?.display_name || reg.user?.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div>{reg.user?.display_name || reg.user?.username}</div>
                        {reg.availability_note && (
                          <div className="text-xs text-gray-400">{reg.availability_note}</div>
                        )}
                      </div>
                      {!reg.has_ships && (
                        <span className="text-xs text-yellow-400 flex items-center gap-1">
                          <AlertCircle size={12} />
                          Keine Schiffe
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">
                      {reg.preferred_unit_id && (
                        <span>
                          Präferenz:{' '}
                          {mission.units.find((u) => u.id === reg.preferred_unit_id)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Noch keine Anmeldungen</p>
            )}
          </div>

          {/* Quick Assign (for managers) */}
          {canManage && allUsers && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">Schnell-Zuweisung</h2>
              <p className="text-sm text-gray-400 mb-4">
                Wähle eine Position und weise einen User oder Platzhalter zu.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <select className="bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white">
                  <option value="">Position wählen...</option>
                  {mission.units.flatMap((unit) =>
                    unit.positions.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {unit.name} - {pos.name}
                      </option>
                    ))
                  )}
                </select>
                <select className="bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white">
                  <option value="">User wählen...</option>
                  {allUsers
                    .filter((u) => ['member', 'officer', 'treasurer', 'admin'].includes(u.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.display_name || user.username}
                      </option>
                    ))}
                </select>
                <button className="px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80">
                  Zuweisen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'briefing' && briefing && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={copyBriefingToClipboard}
              className="flex items-center gap-2 px-4 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-green-400" />
                  Kopiert!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  In Zwischenablage kopieren
                </>
              )}
            </button>
          </div>

          <div className="bg-krt-darker rounded-lg border border-gray-700 p-6 font-mono text-sm whitespace-pre-wrap">
            <div className="text-center mb-6">
              <div className="text-xl font-bold text-krt-orange">{briefing.title.toUpperCase()}</div>
              <div className="text-gray-400">{formatDate(briefing.scheduled_date)}</div>
            </div>

            {(briefing.start_location ||
              briefing.equipment_level ||
              briefing.target_group ||
              briefing.rules_of_engagement) && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">PRE-BRIEFING</div>
                <div className="border-t border-gray-600 pt-2">
                  {briefing.start_location && <div>• Treffpunkt: {briefing.start_location}</div>}
                  {briefing.equipment_level && (
                    <div>• Ausrüstung: {briefing.equipment_level}</div>
                  )}
                  {briefing.target_group && <div>• Zielgruppe: {briefing.target_group}</div>}
                  {briefing.rules_of_engagement && (
                    <div>• ROE: {briefing.rules_of_engagement}</div>
                  )}
                </div>
              </div>
            )}

            {/* Strukturierte Beschreibung */}
            {briefing.mission_context && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">HINTERGRUND</div>
                <div className="border-t border-gray-600 pt-2 whitespace-pre-wrap">
                  {briefing.mission_context}
                </div>
              </div>
            )}

            {briefing.mission_objective && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">EINSATZZIEL</div>
                <div className="border-t border-gray-600 pt-2 whitespace-pre-wrap">
                  {briefing.mission_objective}
                </div>
              </div>
            )}

            {briefing.preparation_notes && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">VORBEREITUNG</div>
                <div className="border-t border-gray-600 pt-2 whitespace-pre-wrap">
                  {briefing.preparation_notes}
                </div>
              </div>
            )}

            {briefing.special_notes && (
              <div className="mb-6">
                <div className="text-yellow-500 font-bold mb-2">⚠️ BESONDERE HINWEISE</div>
                <div className="border-t border-yellow-500/30 pt-2 whitespace-pre-wrap text-yellow-100">
                  {briefing.special_notes}
                </div>
              </div>
            )}

            {briefing.phases.length > 0 && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">ABLAUF</div>
                <div className="border-t border-gray-600 pt-2 space-y-3">
                  {briefing.phases.map((phase) => (
                    <div key={phase.id}>
                      <div className="font-bold">
                        {phase.title}
                        {phase.start_time && ` (${phase.start_time})`}
                      </div>
                      {phase.description && (
                        <div className="text-gray-300 pl-2">{phase.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <div className="text-krt-orange font-bold mb-2">LINE-UP</div>
              <div className="border-t border-gray-600 pt-2 space-y-4">
                {briefing.units.map((unit, idx) => (
                  <div key={idx}>
                    <div className="font-bold">
                      {unit.name.toUpperCase()}
                      {unit.ship_name && ` (${unit.ship_name})`}
                    </div>
                    <div className="pl-2">
                      {unit.positions.map((pos, pidx) => (
                        <div key={pidx}>
                          {pos.name}: {pos.assigned.length > 0 ? pos.assigned.join(', ') : '—'}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {briefing.frequency_table.length > 0 && (
              <div className="mb-6">
                <div className="text-krt-orange font-bold mb-2">FUNKFREQUENZEN</div>
                <div className="border-t border-gray-600 pt-2">
                  <table className="w-full">
                    <tbody>
                      {briefing.frequency_table.map((row, idx) => (
                        <tr key={idx}>
                          <td className="pr-4">{row.unit}</td>
                          {Object.entries(row)
                            .filter(([k]) => k !== 'unit')
                            .map(([k, v]) => (
                              <td key={k} className="pr-4 text-gray-400">
                                {k}: {v}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {briefing.placeholders_used.length > 0 && (
              <div className="text-gray-400 text-xs border-t border-gray-600 pt-2">
                Platzhalter: {briefing.placeholders_used.join(', ')} = Noch zu besetzen
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
