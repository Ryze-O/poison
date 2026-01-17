import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Upload, Plus, X, Check } from 'lucide-react'
import type { AttendanceSession, User, ScanResult } from '../api/types'

export default function AttendancePage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [notes, setNotes] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])

  const canCreate = user?.role !== 'member'

  const { data: sessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendance'],
    queryFn: () => apiClient.get('/api/attendance').then((r) => r.data),
  })

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
    enabled: isCreating,
  })

  const scanMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post('/api/attendance/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (response) => {
      setScanResult(response.data)
      setSelectedUsers(response.data.matched.map((m: { user_id: number }) => m.user_id))
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: { notes: string; records: { user_id: number }[] }) =>
      apiClient.post('/api/attendance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setIsCreating(false)
      setNotes('')
      setScanResult(null)
      setSelectedUsers([])
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      scanMutation.mutate(file)
    }
  }

  const toggleUser = (userId: number) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCreate = () => {
    createMutation.mutate({
      notes,
      records: selectedUsers.map((user_id) => ({ user_id })),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Anwesenheit</h1>
        {canCreate && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Neue Session
          </button>
        )}
      </div>

      {/* Neue Session erstellen */}
      {isCreating && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Neue Session erstellen</h2>
            <button
              onClick={() => {
                setIsCreating(false)
                setScanResult(null)
                setSelectedUsers([])
              }}
              className="text-gray-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Notizen */}
            <div>
              <label className="label">Notizen (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. Mining-Run, PvP-Training..."
                className="input"
              />
            </div>

            {/* Screenshot Upload */}
            <div>
              <label className="label">Screenshot hochladen (OCR)</label>
              <label className="flex items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-krt-orange transition-colors">
                <Upload size={24} className="text-gray-400" />
                <span className="text-gray-400">
                  TeamSpeak/Discord Screenshot auswählen
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {scanMutation.isPending && (
                <p className="mt-2 text-krt-orange">Bild wird analysiert...</p>
              )}
            </div>

            {/* Scan Ergebnis */}
            {scanResult && (
              <div>
                <p className="text-sm text-gray-400 mb-2">
                  {scanResult.total_detected} Namen erkannt,{' '}
                  {scanResult.matched.length} zugeordnet
                </p>
                {scanResult.unmatched.length > 0 && (
                  <p className="text-sm text-yellow-500 mb-2">
                    Nicht zugeordnet: {scanResult.unmatched.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Benutzer-Auswahl */}
            <div>
              <label className="label">Anwesende Mitglieder</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {allUsers?.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${
                      selectedUsers.includes(u.id)
                        ? 'bg-krt-orange text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {selectedUsers.includes(u.id) && <Check size={16} />}
                    <span className="truncate">
                      {u.display_name || u.username}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Speichern */}
            <button
              onClick={handleCreate}
              disabled={selectedUsers.length === 0 || createMutation.isPending}
              className="btn btn-primary w-full"
            >
              {createMutation.isPending
                ? 'Wird gespeichert...'
                : `Session mit ${selectedUsers.length} Teilnehmern erstellen`}
            </button>
          </div>
        </div>
      )}

      {/* Session Liste */}
      <div className="space-y-4">
        {sessions?.map((session) => (
          <div key={session.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  {new Date(session.date).toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h3>
                {session.notes && (
                  <p className="text-gray-400">{session.notes}</p>
                )}
              </div>
              <span className="text-sm text-gray-500">
                von {session.created_by.display_name || session.created_by.username}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.records.map((record) => (
                <span
                  key={record.id}
                  className="px-3 py-1 bg-gray-800 rounded-full text-sm"
                >
                  {record.user?.display_name ||
                    record.user?.username ||
                    record.detected_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
