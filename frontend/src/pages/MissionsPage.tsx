import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import {
  Plus,
  Calendar,
  MapPin,
  Users,
  ChevronRight,
  Edit3,
  Eye,
  Rocket,
  FileText,
} from 'lucide-react'
import type { Mission, MissionStatus, MissionTemplate } from '../api/types'

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

function StatusBadge({ status }: { status: MissionStatus }) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[status]} text-white`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function MissionCard({ mission, canManage }: { mission: Mission; canManage: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const publishMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/missions/${mission.id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isOwner = mission.created_by_id === useAuthStore.getState().user?.id
  const canEdit = canManage || isOwner

  return (
    <div className="bg-krt-dark rounded-lg border border-gray-700 p-4 hover:border-krt-orange/50 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={mission.status} />
            {mission.status === 'draft' && (
              <span className="text-xs text-gray-400">Nur für dich sichtbar</span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-white">{mission.title}</h3>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-300 mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <span>{formatDate(mission.scheduled_date)}</span>
          {mission.duration_minutes && (
            <span className="text-gray-400">
              (ca. {Math.floor(mission.duration_minutes / 60)}h{' '}
              {mission.duration_minutes % 60 > 0 && `${mission.duration_minutes % 60}min`})
            </span>
          )}
        </div>

        {mission.start_location_name && (
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-gray-400" />
            <span>{mission.start_location_name}</span>
          </div>
        )}

        {mission.target_group && (
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <span>{mission.target_group}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          <span>
            {mission.assignment_count}/{mission.total_positions} besetzt
          </span>
          {mission.registration_count > 0 && (
            <span className="text-gray-400">({mission.registration_count} angemeldet)</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {mission.status === 'draft' && canEdit && (
          <>
            <button
              onClick={() => navigate(`/einsaetze/${mission.id}/bearbeiten`)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700 text-sm"
            >
              <Edit3 size={16} />
              Bearbeiten
            </button>
            <button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 rounded hover:bg-green-700 text-sm disabled:opacity-50"
            >
              <Rocket size={16} />
              Veröffentlichen
            </button>
          </>
        )}

        {mission.status === 'published' && (
          <>
            <Link
              to={`/einsaetze/${mission.id}`}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-krt-orange rounded hover:bg-krt-orange/80 text-sm text-white"
            >
              <Users size={16} />
              Anmelden
            </Link>
            <Link
              to={`/einsaetze/${mission.id}`}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700 text-sm"
            >
              <ChevronRight size={16} />
              Details
            </Link>
          </>
        )}

        {['locked', 'active', 'completed'].includes(mission.status) && (
          <Link
            to={`/einsaetze/${mission.id}`}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700 text-sm"
          >
            <Eye size={16} />
            {mission.status === 'completed' ? 'Ansehen' : 'Details'}
          </Link>
        )}

        {canEdit && mission.status !== 'draft' && (
          <Link
            to={`/einsaetze/${mission.id}/bearbeiten`}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700 text-sm"
          >
            <Edit3 size={16} />
          </Link>
        )}
      </div>
    </div>
  )
}

export default function MissionsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<MissionStatus | 'all'>('all')
  const [showUpcoming, setShowUpcoming] = useState(true)

  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const user = useAuthStore.getState().user
  const canCreate =
    effectiveRole === 'admin' ||
    effectiveRole === 'officer' ||
    effectiveRole === 'treasurer' ||
    user?.is_kg_verwalter

  const { data: missions, isLoading } = useQuery<Mission[]>({
    queryKey: ['missions', statusFilter, showUpcoming],
    queryFn: () => {
      let url = '/api/missions?limit=50'
      if (statusFilter !== 'all') {
        url += `&status_filter=${statusFilter}`
      }
      if (showUpcoming) {
        url += '&upcoming=true'
      }
      return apiClient.get(url).then((r) => r.data)
    },
  })

  const { data: templates } = useQuery<MissionTemplate[]>({
    queryKey: ['mission-templates'],
    queryFn: () => apiClient.get('/api/missions/templates').then((r) => r.data),
    enabled: canCreate,
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Einsätze</h1>
        {canCreate && (
          <button
            onClick={() => navigate('/einsaetze/neu')}
            className="flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
          >
            <Plus size={20} />
            Neuer Einsatz
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MissionStatus | 'all')}
            className="bg-krt-dark border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Alle</option>
            <option value="draft">Entwurf</option>
            <option value="published">Veröffentlicht</option>
            <option value="locked">Gesperrt</option>
            <option value="active">Aktiv</option>
            <option value="completed">Abgeschlossen</option>
            <option value="cancelled">Abgesagt</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showUpcoming}
            onChange={(e) => setShowUpcoming(e.target.checked)}
            className="w-4 h-4 rounded bg-krt-dark border-gray-600 text-krt-orange focus:ring-krt-orange"
          />
          Nur kommende
        </label>
      </div>

      {/* Missions List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Lade Einsätze...</div>
      ) : missions && missions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} canManage={canCreate ?? false} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-krt-dark rounded-lg border border-gray-700">
          <FileText size={48} className="mx-auto text-gray-500 mb-4" />
          <p className="text-gray-400 mb-4">Keine Einsätze gefunden</p>
          {canCreate && (
            <button
              onClick={() => navigate('/einsaetze/neu')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
            >
              <Plus size={20} />
              Ersten Einsatz erstellen
            </button>
          )}
        </div>
      )}

      {/* Templates Hint */}
      {canCreate && templates && templates.length > 0 && (
        <div className="mt-8 p-4 bg-krt-dark rounded-lg border border-gray-700">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Verfügbare Templates</h3>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => navigate(`/einsaetze/neu?template=${template.id}`)}
                className="px-3 py-1.5 bg-gray-700 rounded text-sm hover:bg-gray-600"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
