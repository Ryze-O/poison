import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
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
  Trash2,
} from 'lucide-react'
import MissionAssignmentPanel from '../components/MissionAssignmentPanel'
import type {
  MissionDetail,
  MissionStatus,
  Briefing,
  UserLoadout,
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

// ROE Übersetzungen
const ROE_TRANSLATIONS: Record<string, string> = {
  'Weapons Hold': 'Nur schießen auf Befehl',
  'Weapons Tight': 'Reaktiv handeln, dem Handeln des Gegners angepasst',
  'Weapons Free': 'Ich schieße auf alles',
}

// Funkfrequenz-Schlüssel in fester Reihenfolge
const FREQUENCY_ORDER = ['el', 'intern', 'targets']

type TabType = 'overview' | 'units' | 'participants' | 'briefing'

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [copied, setCopied] = useState(false)
  const [registrationNote, setRegistrationNote] = useState('')
  const [shipInfo, setShipInfo] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [selectedLoadoutIds, setSelectedLoadoutIds] = useState<number[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  // Eigene gefittete Schiffe (für Registrierung)
  const { data: myShips } = useQuery<UserLoadout[]>({
    queryKey: ['my-ships'],
    queryFn: () => apiClient.get('/api/loadouts/my-ships').then((r) => r.data),
    enabled: !!currentUser && ['member', 'officer', 'admin'].includes(currentUser.role),
  })

  const canManage = effectiveRole === 'admin' || effectiveRole === 'officer' || currentUser?.is_kg_verwalter

  // Mutations
  const registerMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/missions/${id}/register`, {
        preferred_unit_id: selectedUnitId,
        availability_note: registrationNote || null,
        ship_info: shipInfo || null,
        user_loadout_ids: selectedLoadoutIds.length > 0 ? selectedLoadoutIds : null,
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

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/missions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      navigate('/einsaetze')
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
    if (briefing.rules_of_engagement) {
      const translation = ROE_TRANSLATIONS[briefing.rules_of_engagement]
      text += `• ROE: ${briefing.rules_of_engagement}${translation ? ` - ${translation}` : ''}\n`
    }
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
        const entries = FREQUENCY_ORDER
          .filter((key) => row[key] !== undefined)
          .map((key) => `${key}: ${row[key]}`)
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
          className="inline-flex items-center gap-2 text-gray-400 hover:text-primary mb-4"
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
            {canManage && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded hover:bg-red-600/40"
                title="Einsatz löschen"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-krt-dark border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Einsatz löschen?</h3>
            <p className="text-gray-400 mb-6">
              Möchtest du den Einsatz <span className="text-white font-medium">"{mission.title}"</span> wirklich
              löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate()
                  setShowDeleteConfirm(false)
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={16} />
                {deleteMutation.isPending ? 'Löschen...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  : 'border-transparent text-gray-400 hover:text-primary'
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Voraussetzungen</h2>
              {canManage && (
                <Link
                  to={`/einsaetze/${id}/bearbeiten?step=1`}
                  className="p-1.5 text-gray-400 hover:text-krt-orange rounded hover:bg-gray-700"
                  title="Bearbeiten"
                >
                  <Edit3 size={16} />
                </Link>
              )}
            </div>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Beschreibung</h2>
                {canManage && (
                  <Link
                    to={`/einsaetze/${id}/bearbeiten?step=1`}
                    className="p-1.5 text-gray-400 hover:text-krt-orange rounded hover:bg-gray-700"
                    title="Bearbeiten"
                  >
                    <Edit3 size={16} />
                  </Link>
                )}
              </div>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Ablauf</h2>
                {canManage && (
                  <Link
                    to={`/einsaetze/${id}/bearbeiten?step=3`}
                    className="p-1.5 text-gray-400 hover:text-krt-orange rounded hover:bg-gray-700"
                    title="Bearbeiten"
                  >
                    <Edit3 size={16} />
                  </Link>
                )}
              </div>
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
                  {/* Kategorie-Auswahl als Radio Buttons */}
                  {mission.units.length > 0 && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Wähle deine Kategorie:
                      </label>
                      <div className="space-y-2">
                        {mission.units.map((unit) => {
                          // Zähle Anmeldungen für diese Kategorie
                          const registeredCount = mission.registrations.filter(
                            (r) => r.preferred_unit_id === unit.id
                          ).length
                          const crewCount = unit.crew_count || 1

                          return (
                            <label
                              key={unit.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedUnitId === unit.id
                                  ? 'border-krt-orange bg-krt-orange/10'
                                  : 'border-gray-600 hover:border-gray-500'
                              }`}
                            >
                              <input
                                type="radio"
                                name="category"
                                checked={selectedUnitId === unit.id}
                                onChange={() => setSelectedUnitId(unit.id)}
                                className="w-4 h-4 text-krt-orange"
                              />
                              <div className="flex-1">
                                <span className="font-medium">{unit.name}</span>
                                {unit.ship_name && (
                                  <span className="text-gray-400 ml-2">({unit.ship_name})</span>
                                )}
                              </div>
                              <span className={`text-sm ${registeredCount >= crewCount ? 'text-yellow-400' : 'text-gray-400'}`}>
                                {registeredCount}/{crewCount} angemeldet
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
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
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Schiff am Einsatzort bereit (optional)
                    </label>
                    <input
                      type="text"
                      value={shipInfo}
                      onChange={(e) => setShipInfo(e.target.value)}
                      placeholder="z.B. 'Polaris meta-gefittet am Treffpunkt'"
                      className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Teile dem Planer mit, welches Schiff du für den Einsatz bereit hast
                    </p>
                  </div>
                  {/* Gefittete Schiffe auswählen */}
                  {myShips && myShips.length > 0 && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Gefittete Schiffe für diesen Einsatz (optional)
                      </label>
                      <div className="space-y-1.5">
                        {myShips.filter(s => s.is_ready).map(ship => (
                          <label
                            key={ship.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              selectedLoadoutIds.includes(ship.id)
                                ? 'border-krt-orange bg-krt-orange/10'
                                : 'border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedLoadoutIds.includes(ship.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLoadoutIds([...selectedLoadoutIds, ship.id])
                                } else {
                                  setSelectedLoadoutIds(selectedLoadoutIds.filter(id => id !== ship.id))
                                }
                              }}
                              className="w-4 h-4 text-krt-orange rounded"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-sm">{ship.ship.name}</span>
                              {ship.ship_nickname && (
                                <span className="text-gray-400 text-sm ml-1">"{ship.ship_nickname}"</span>
                              )}
                              <span className="text-xs text-gray-500 ml-2">
                                ({ship.loadout.name})
                              </span>
                            </div>
                            <Check size={14} className="text-green-400" />
                          </label>
                        ))}
                      </div>
                      {myShips.filter(s => !s.is_ready).length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {myShips.filter(s => !s.is_ready).length} Schiffe nicht einsatzbereit (nicht angezeigt)
                        </p>
                      )}
                    </div>
                  )}
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
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Link
                to={`/einsaetze/${id}/bearbeiten?step=2`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-krt-orange border border-gray-600 rounded hover:border-krt-orange"
              >
                <Edit3 size={14} />
                Einheiten bearbeiten
              </Link>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2">
          {mission.units
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((unit) => {
              // Bestimme Bild basierend auf Unit-Typ oder Name
              const getUnitImage = () => {
                const name = (unit.name || '').toLowerCase()
                const type = (unit.unit_type || '').toLowerCase()

                // Mapping für bekannte Einheiten (starcitizen.tools images)
                if (name.includes('gks') || type.includes('capital') || name.includes('idris') || name.includes('polaris') || name.includes('javelin')) {
                  return 'https://media.starcitizen.tools/d/dd/Idris_M_flying_over_world_-_cropped.jpg' // Idris
                }
                if (name.includes('jäger') || name.includes('jaeger') || type.includes('fighter') || name.includes('gladius')) {
                  return 'https://media.starcitizen.tools/0/0c/Gladius_-_Flying_away_from_world_through_debris.jpg' // Gladius
                }
                if (name.includes('deals') || name.includes('fps') || name.includes('squad') || type.includes('infantry') || name.includes('boden')) {
                  return 'https://media.starcitizen.tools/c/cd/StarMarine-UnderFire.jpg' // Marines unter Feuer
                }
                if (name.includes('beast') || name.includes('ballista') || type.includes('ground') || name.includes('fahrzeug')) {
                  return 'https://media.starcitizen.tools/c/cb/Ballista_on_glassland_firing_weapons_-_cropped.jpg' // Ballista
                }
                if (name.includes('dropship') || name.includes('transport') || name.includes('starlancer') || name.includes('valkyrie')) {
                  return 'https://media.starcitizen.tools/0/07/Valkyrie_flying_through_debris_shooting_back_at_ships_-_cut.jpg' // Valkyrie
                }
                if (name.includes('bomber') || name.includes('retaliator') || name.includes('eclipse')) {
                  return 'https://media.starcitizen.tools/7/7c/Retaliator_flying_through_gasseous_asteroid_field_firing_torpedo.jpg' // Retaliator
                }
                return null
              }

              const unitImage = getUnitImage()

              return (
                <div key={unit.id} className="bg-krt-dark rounded-lg border border-gray-700 overflow-hidden">
                  {/* Header mit Bild */}
                  <div className="relative h-32">
                    {unitImage ? (
                      <img
                        src={unitImage}
                        alt={unit.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback bei Ladefehler
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-krt-orange/20 to-krt-darker" />
                    )}
                    {/* Overlay für bessere Lesbarkeit */}
                    <div className="absolute inset-0 bg-gradient-to-t from-krt-dark via-krt-dark/50 to-transparent" />
                    {/* Unit Name overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex justify-between items-end">
                        <div>
                          <h3 className="font-bold text-xl text-white drop-shadow-lg">{unit.name}</h3>
                          {unit.ship_name && (
                            <span className="text-sm text-gray-300">{unit.ship_name}</span>
                          )}
                        </div>
                        {unit.radio_frequencies && (
                          <div className="flex items-center gap-1 text-xs text-gray-300 bg-black/40 px-2 py-1 rounded">
                            <Radio size={12} />
                            {Object.values(unit.radio_frequencies).slice(0, 2).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Positionen */}
                  <div className="p-4">
                    <div className="space-y-1">
                      {unit.positions
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((pos) => (
                          <div
                            key={pos.id}
                            className="flex items-center gap-2 py-2 border-b border-gray-700/50 last:border-0"
                          >
                            {/* Rolle (links) */}
                            <div className="flex-1 min-w-0">
                              {pos.position_type || pos.required_role_name ? (
                                <span className="text-krt-orange font-medium text-sm truncate block">
                                  {pos.position_type || pos.required_role_name}
                                </span>
                              ) : (
                                <span className="text-gray-500 text-sm">—</span>
                              )}
                            </div>

                            {/* User (rechts) */}
                            <div className="flex-1 text-right">
                              {pos.assignments.length > 0 ? (
                                pos.assignments.map((a) => (
                                  <div key={a.id} className="flex items-center justify-end gap-2">
                                    <span className="text-white text-sm font-medium">
                                      {a.user?.display_name || a.user?.username || a.placeholder_name}
                                    </span>
                                    {a.is_training && (
                                      <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">i.A.</span>
                                    )}
                                    {a.is_backup && (
                                      <span className="text-xs px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">Backup</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <span className="text-gray-600 text-sm">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
                          src={reg.user.avatar}
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
                        {reg.ship_info && (
                          <div className="text-xs text-krt-orange">🚀 {reg.ship_info}</div>
                        )}
                        {reg.user_loadouts_resolved && reg.user_loadouts_resolved.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {reg.user_loadouts_resolved.map(ul => (
                              <span
                                key={ul.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  ul.is_ready
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-yellow-500/20 text-yellow-400'
                                }`}
                              >
                                {ul.ship_name}
                                {ul.ship_nickname && ` "${ul.ship_nickname}"`}
                                {ul.loadout_name && ` (${ul.loadout_name})`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!reg.has_ships && !reg.user_loadouts_resolved?.length && (
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

          {/* Assignment Panel (for managers) */}
          {canManage && <MissionAssignmentPanel missionId={mission.id} />}
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
                    <div>
                      • ROE: {briefing.rules_of_engagement}
                      {ROE_TRANSLATIONS[briefing.rules_of_engagement] && (
                        <span className="text-gray-400 ml-2">
                          - {ROE_TRANSLATIONS[briefing.rules_of_engagement]}
                        </span>
                      )}
                    </div>
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
                          {FREQUENCY_ORDER
                            .filter((key) => row[key] !== undefined)
                            .map((key) => (
                              <td key={key} className="pr-4 text-gray-400">
                                {key}: {row[key]}
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
