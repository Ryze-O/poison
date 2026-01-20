import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import {
  Upload,
  Plus,
  X,
  Check,
  Clipboard,
  UserPlus,
  Trash2,
  CheckCircle,
  Package,
  ChevronDown,
  ChevronUp,
  Edit3,
  Image,
} from 'lucide-react'
import type { AttendanceSession, User, ScanResult, OCRData, UserRequest, SessionType } from '../api/types'

interface UnmatchedAssignment {
  name: string
  userId: number | null
  saveAsAlias: boolean
  createNewUser: boolean
  newUsername: string
}

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  staffelabend: 'Staffelabend',
  loot_run: 'Loot-Run',
  freeplay: 'Freeplay',
}

export default function AttendancePage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [sessionType, setSessionType] = useState<SessionType>('staffelabend')
  const [notes, setNotes] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [unmatchedAssignments, setUnmatchedAssignments] = useState<UnmatchedAssignment[]>([])
  const [expandedSession, setExpandedSession] = useState<number | null>(null)
  // Kombiniertes Edit-Modal für Session-Bearbeitung (OCR + Teilnehmer + Bestätigen)
  const [editingSession, setEditingSession] = useState<AttendanceSession | null>(null)
  const [editScreenshotUrl, setEditScreenshotUrl] = useState<string | null>(null)
  const [editOcrData, setEditOcrData] = useState<OCRData | null>(null)
  const [editSelectedUsers, setEditSelectedUsers] = useState<number[]>([])
  // OCR-Zuordnungen für nicht erkannte Namen
  const [ocrAssignments, setOcrAssignments] = useState<Record<string, { userId: number | null; saveAsAlias: boolean }>>({})

  const canCreate = user?.role !== 'member'
  const isAdmin = user?.role === 'admin'

  const { data: sessions } = useQuery<AttendanceSession[]>({
    queryKey: ['attendance'],
    queryFn: () => apiClient.get('/api/attendance').then((r) => r.data),
  })

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users').then((r) => r.data),
    enabled: isCreating || editingSession !== null,
  })

  const { data: pendingRequests } = useQuery<UserRequest[]>({
    queryKey: ['user-requests', 'pending'],
    queryFn: () =>
      apiClient.get('/api/attendance/user-requests?status_filter=pending').then((r) => r.data),
    enabled: isAdmin,
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
      // Initialisiere unmatched assignments
      setUnmatchedAssignments(
        response.data.unmatched.map((name: string) => ({
          name,
          userId: null,
          saveAsAlias: true,
          createNewUser: false,
          newUsername: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        }))
      )
    },
  })

  const createUserRequestMutation = useMutation({
    mutationFn: (data: { username: string; display_name?: string; detected_name: string }) =>
      apiClient.post('/api/attendance/user-requests', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-requests'] })
    },
  })

  const approveRequestMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.post(`/api/attendance/user-requests/${requestId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-requests'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const rejectRequestMutation = useMutation({
    mutationFn: (requestId: number) =>
      apiClient.post(`/api/attendance/user-requests/${requestId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-requests'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: {
      session_type: SessionType
      notes: string
      records: { user_id: number; detected_name?: string }[]
      screenshot_base64?: string
      ocr_data?: { matched: unknown[]; unmatched: string[] }
    }) => apiClient.post('/api/attendance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setIsCreating(false)
      setSessionType('staffelabend')
      setNotes('')
      setScanResult(null)
      setSelectedUsers([])
      setUnmatchedAssignments([])
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (sessionId: number) =>
      apiClient.patch(`/api/attendance/${sessionId}`, { is_confirmed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })

  const createLootSessionMutation = useMutation({
    mutationFn: (attendanceSessionId: number) =>
      apiClient.post('/api/loot', { attendance_session_id: attendanceSessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['loot'] })
    },
  })

  // Session löschen (Admin only)
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => apiClient.delete(`/api/attendance/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      closeEditModal()
    },
  })

  // Session löschen mit Bestätigung
  const handleDeleteSession = (sessionId: number) => {
    if (window.confirm('Session wirklich löschen? Dies kann nicht rückgängig gemacht werden.')) {
      deleteSessionMutation.mutate(sessionId)
    }
  }

  // Kombiniertes Edit-Modal öffnen (lädt OCR-Daten und Screenshot)
  const openEditModal = async (session: AttendanceSession) => {
    setEditingSession(session)
    setEditSelectedUsers(session.records.filter(r => r.user).map(r => r.user!.id))
    setOcrAssignments({})

    // OCR-Daten laden falls vorhanden
    if (session.has_screenshot && !session.is_confirmed) {
      try {
        const ocrResponse = await apiClient.get(`/api/attendance/${session.id}/ocr-data`)
        setEditOcrData(ocrResponse.data)
      } catch {
        setEditOcrData(null)
      }

      // Screenshot laden
      try {
        const screenshotResponse = await apiClient.get(`/api/attendance/${session.id}/screenshot`, {
          responseType: 'blob',
        })
        const url = URL.createObjectURL(screenshotResponse.data)
        setEditScreenshotUrl(url)
      } catch {
        setEditScreenshotUrl(null)
      }
    } else {
      setEditOcrData(null)
      setEditScreenshotUrl(null)
    }
  }

  // Edit-Modal schließen und aufräumen
  const closeEditModal = () => {
    setEditingSession(null)
    setEditSelectedUsers([])
    setEditOcrData(null)
    setOcrAssignments({})
    if (editScreenshotUrl) {
      URL.revokeObjectURL(editScreenshotUrl)
      setEditScreenshotUrl(null)
    }
    queryClient.invalidateQueries({ queryKey: ['attendance'] })
  }

  // Session bearbeiten - User hinzufügen
  const addRecordMutation = useMutation({
    mutationFn: ({ sessionId, userId, detectedName }: { sessionId: number; userId: number; detectedName?: string }) =>
      apiClient.post(`/api/attendance/${sessionId}/records`, { user_id: userId, detected_name: detectedName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })

  // Session bearbeiten - User entfernen
  const removeRecordMutation = useMutation({
    mutationFn: ({ sessionId, recordId }: { sessionId: number; recordId: number }) =>
      apiClient.delete(`/api/attendance/${sessionId}/records/${recordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })

  // Alias zu User hinzufügen
  const addAliasMutation = useMutation({
    mutationFn: ({ userId, alias }: { userId: number; alias: string }) =>
      apiClient.post(`/api/users/${userId}/aliases?alias=${encodeURIComponent(alias)}`),
  })

  // OCR-Zuordnungen speichern und zur Session hinzufügen
  const saveOcrAssignments = async () => {
    if (!editingSession) return

    const sessionId = editingSession.id
    const assignments = Object.entries(ocrAssignments).filter(([, v]) => v.userId !== null)

    for (const [name, { userId, saveAsAlias }] of assignments) {
      if (userId) {
        // User zur Session hinzufügen
        await addRecordMutation.mutateAsync({ sessionId, userId, detectedName: name })

        // Optional: Als Alias speichern
        if (saveAsAlias) {
          await addAliasMutation.mutateAsync({ userId, alias: name })
        }
      }
    }

    // OCR-Zuordnungen zurücksetzen (Modal bleibt offen)
    setOcrAssignments({})
    // Session-Daten neu laden
    const updatedSessions = await queryClient.fetchQuery<AttendanceSession[]>({
      queryKey: ['attendance'],
      queryFn: () => apiClient.get('/api/attendance').then((r) => r.data),
    })
    const updatedSession = updatedSessions?.find((s: AttendanceSession) => s.id === sessionId)
    if (updatedSession) {
      setEditingSession(updatedSession)
      setEditSelectedUsers(updatedSession.records.filter((r) => r.user).map((r) => r.user!.id))
    }
  }

  // User zur Session hinzufügen
  const handleAddUserToSession = async (userId: number) => {
    if (!editingSession) return
    await addRecordMutation.mutateAsync({ sessionId: editingSession.id, userId })
    setEditSelectedUsers(prev => [...prev, userId])
    // Session-Daten aktualisieren
    const updatedSessions = await queryClient.fetchQuery<AttendanceSession[]>({
      queryKey: ['attendance'],
      queryFn: () => apiClient.get('/api/attendance').then((r) => r.data),
    })
    const updatedSession = updatedSessions?.find((s: AttendanceSession) => s.id === editingSession.id)
    if (updatedSession) {
      setEditingSession(updatedSession)
    }
  }

  // User aus Session entfernen
  const handleRemoveUserFromSession = async (recordId: number, userId: number) => {
    if (!editingSession) return
    await removeRecordMutation.mutateAsync({ sessionId: editingSession.id, recordId })
    setEditSelectedUsers(prev => prev.filter(id => id !== userId))
    // Session-Daten aktualisieren
    const updatedSessions = await queryClient.fetchQuery<AttendanceSession[]>({
      queryKey: ['attendance'],
      queryFn: () => apiClient.get('/api/attendance').then((r) => r.data),
    })
    const updatedSession = updatedSessions?.find((s: AttendanceSession) => s.id === editingSession.id)
    if (updatedSession) {
      setEditingSession(updatedSession)
    }
  }

  // Session bestätigen (aus dem Edit-Modal heraus)
  const handleConfirmSession = async () => {
    if (!editingSession) return
    await confirmMutation.mutateAsync(editingSession.id)
    closeEditModal()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      scanMutation.mutate(file)
    }
  }

  // Paste-Handler für Strg+V
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!isCreating) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            scanMutation.mutate(file)
            break
          }
        }
      }
    },
    [isCreating, scanMutation]
  )

  // Event-Listener für Paste registrieren
  useEffect(() => {
    if (isCreating) {
      document.addEventListener('paste', handlePaste)
      return () => document.removeEventListener('paste', handlePaste)
    }
  }, [isCreating, handlePaste])

  const toggleUser = (userId: number) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const handleCreate = async () => {
    // Zuerst Aliase speichern für zugewiesene Namen mit aktivierter Checkbox
    const aliasPromises = unmatchedAssignments
      .filter((item) => item.userId && item.saveAsAlias && !item.createNewUser)
      .map((item) =>
        addAliasMutation.mutateAsync({
          userId: item.userId!,
          alias: item.name,
        })
      )

    // User-Requests für neue User erstellen
    const userRequestPromises = unmatchedAssignments
      .filter((item) => item.createNewUser && item.newUsername.trim().length >= 2)
      .map((item) =>
        createUserRequestMutation.mutateAsync({
          username: item.newUsername.trim(),
          display_name: item.name,
          detected_name: item.name,
        })
      )

    try {
      await Promise.all([...aliasPromises, ...userRequestPromises])
    } catch (error) {
      console.error('Fehler beim Speichern:', error)
    }

    // Session erstellen mit Screenshot und OCR-Daten
    createMutation.mutate({
      session_type: sessionType,
      notes,
      records: selectedUsers.map((user_id) => ({ user_id })),
      screenshot_base64: scanResult?.screenshot_base64,
      ocr_data: scanResult
        ? {
            matched: scanResult.matched,
            unmatched: scanResult.unmatched,
          }
        : undefined,
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

      {/* Pending User Requests (nur für Admins) */}
      {isAdmin && pendingRequests && pendingRequests.length > 0 && (
        <div className="card mb-8 border-2 border-yellow-600">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-yellow-500">
            <UserPlus size={24} />
            Offene User-Anträge ({pendingRequests.length})
          </h2>
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div>
                  <span className="font-medium">{request.username}</span>
                  {request.display_name && (
                    <span className="text-gray-400 ml-2">({request.display_name})</span>
                  )}
                  <span className="text-sm text-gray-500 ml-3">
                    OCR: "{request.detected_name}" - von{' '}
                    {request.requested_by.display_name || request.requested_by.username}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveRequestMutation.mutate(request.id)}
                    disabled={approveRequestMutation.isPending}
                    className="btn btn-primary text-sm py-1 px-3"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => rejectRequestMutation.mutate(request.id)}
                    disabled={rejectRequestMutation.isPending}
                    className="btn bg-red-600 hover:bg-red-700 text-sm py-1 px-3"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neue Session erstellen */}
      {isCreating && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Neue Session erstellen</h2>
            <button
              onClick={() => {
                setIsCreating(false)
                setSessionType('staffelabend')
                setScanResult(null)
                setSelectedUsers([])
                setUnmatchedAssignments([])
              }}
              className="text-gray-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Session-Typ */}
            <div>
              <label className="label">Session-Typ</label>
              <div className="flex gap-3">
                {(Object.keys(SESSION_TYPE_LABELS) as SessionType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSessionType(type)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      sessionType === type
                        ? 'bg-krt-orange text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {SESSION_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

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

            {/* Screenshot Upload / Paste */}
            <div>
              <label className="label">Screenshot hochladen (OCR)</label>
              <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-krt-orange transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Upload size={24} />
                    <span>Datei auswählen</span>
                  </div>
                  <span className="text-gray-600">oder</span>
                  <div className="flex items-center gap-2 text-krt-orange">
                    <Clipboard size={24} />
                    <span>Strg+V zum Einfügen</span>
                  </div>
                </div>
                <span className="text-sm text-gray-500">TeamSpeak/Discord Screenshot</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {scanMutation.isPending && (
                <p className="mt-2 text-krt-orange animate-pulse">Bild wird analysiert...</p>
              )}
              {scanMutation.isError && (
                <p className="mt-2 text-red-500">
                  Fehler beim Analysieren:{' '}
                  {(scanMutation.error as Error)?.message || 'Unbekannter Fehler'}
                </p>
              )}
            </div>

            {/* Scan Ergebnis */}
            {scanResult && (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  {scanResult.total_detected} Namen erkannt, {scanResult.matched.length} zugeordnet
                </p>

                {/* Zugeordnete Namen */}
                {scanResult.matched.length > 0 && (
                  <div>
                    <p className="text-sm text-green-500 mb-2 flex items-center gap-2">
                      <Check size={16} />
                      Automatisch zugeordnet:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {scanResult.matched.map((m: { user_id: number; detected_name: string }) => {
                        const matchedUser = allUsers?.find((u) => u.id === m.user_id)
                        return (
                          <span
                            key={m.user_id}
                            className="px-3 py-1 bg-green-900/30 border border-green-700 rounded-full text-sm text-green-300"
                          >
                            {matchedUser?.display_name || matchedUser?.username || m.detected_name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Nicht zugeordnete Namen - Manuelle Zuordnung */}
                {unmatchedAssignments.length > 0 && (
                  <div>
                    <p className="text-sm text-yellow-500 mb-3 flex items-center gap-2">
                      <UserPlus size={16} />
                      Nicht zugeordnet - Bitte manuell zuweisen:
                    </p>
                    <div className="space-y-2">
                      {unmatchedAssignments.map((item, index) => (
                        <div
                          key={item.name}
                          className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-yellow-400 font-mono min-w-32">{item.name}</span>

                            {!item.createNewUser ? (
                              <>
                                <select
                                  value={item.userId || ''}
                                  onChange={(e) => {
                                    const newAssignments = [...unmatchedAssignments]
                                    newAssignments[index].userId = e.target.value
                                      ? parseInt(e.target.value)
                                      : null
                                    setUnmatchedAssignments(newAssignments)
                                    if (e.target.value) {
                                      const userId = parseInt(e.target.value)
                                      if (!selectedUsers.includes(userId)) {
                                        setSelectedUsers((prev) => [...prev, userId])
                                      }
                                    }
                                  }}
                                  className="input flex-1"
                                >
                                  <option value="">-- Ignorieren --</option>
                                  {allUsers
                                    ?.filter(
                                      (u) => !selectedUsers.includes(u.id) || u.id === item.userId
                                    )
                                    .map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.display_name || u.username}
                                      </option>
                                    ))}
                                </select>

                                {item.userId && (
                                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={item.saveAsAlias}
                                      onChange={(e) => {
                                        const newAssignments = [...unmatchedAssignments]
                                        newAssignments[index].saveAsAlias = e.target.checked
                                        setUnmatchedAssignments(newAssignments)
                                      }}
                                      className="w-4 h-4 rounded border-gray-600 text-krt-orange focus:ring-krt-orange"
                                    />
                                    Als Alias speichern
                                  </label>
                                )}
                              </>
                            ) : (
                              <input
                                type="text"
                                value={item.newUsername}
                                onChange={(e) => {
                                  const newAssignments = [...unmatchedAssignments]
                                  newAssignments[index].newUsername = e.target.value
                                  setUnmatchedAssignments(newAssignments)
                                }}
                                placeholder="Benutzername für neuen User"
                                className="input flex-1"
                              />
                            )}

                            <button
                              onClick={() => {
                                const newAssignments = [...unmatchedAssignments]
                                newAssignments[index].createNewUser = !item.createNewUser
                                newAssignments[index].userId = null
                                setUnmatchedAssignments(newAssignments)
                              }}
                              className={`btn text-sm py-1 px-3 ${
                                item.createNewUser ? 'btn-primary' : 'bg-gray-700 hover:bg-gray-600'
                              }`}
                              title={
                                item.createNewUser ? 'Abbrechen' : 'Neuen User anlegen/beantragen'
                              }
                            >
                              <UserPlus size={16} />
                            </button>

                            <button
                              onClick={() => {
                                setUnmatchedAssignments((prev) =>
                                  prev.filter((_, i) => i !== index)
                                )
                              }}
                              className="text-gray-500 hover:text-red-400 p-1"
                              title="Ignorieren"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {item.createNewUser && (
                            <p className="text-xs text-gray-500 ml-32">
                              {isAdmin
                                ? 'User wird direkt angelegt'
                                : 'Antrag wird an Admin gesendet'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
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
                    <span className="truncate">{u.display_name || u.username}</span>
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setExpandedSession(expandedSession === session.id ? null : session.id)
                  }
                  className="text-gray-400 hover:text-white"
                >
                  {expandedSession === session.id ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </button>
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    {new Date(session.date).toLocaleDateString('de-DE', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    <span className={`text-sm font-normal px-2 py-0.5 rounded ${
                      session.session_type === 'loot_run' ? 'bg-amber-600/30 text-amber-400' :
                      session.session_type === 'freeplay' ? 'bg-blue-600/30 text-blue-400' :
                      'bg-emerald-600/30 text-emerald-400'
                    }`}>
                      {SESSION_TYPE_LABELS[session.session_type] || 'Staffelabend'}
                    </span>
                    {session.is_confirmed && (
                      <span title="Bestätigt"><CheckCircle size={18} className="text-green-500" /></span>
                    )}
                    {session.has_loot_session && (
                      <span title="Hat Loot-Session"><Package size={18} className="text-krt-orange" /></span>
                    )}
                  </h3>
                  {session.notes && <p className="text-gray-400">{session.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  von {session.created_by.display_name || session.created_by.username}
                </span>
                <span className="text-sm bg-gray-700 px-2 py-1 rounded">
                  {session.records.length} Teilnehmer
                </span>
              </div>
            </div>

            {/* Expanded Content */}
            {expandedSession === session.id && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                {/* Teilnehmer */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {session.records.map((record) => (
                    <span key={record.id} className="px-3 py-1 bg-gray-800 rounded-full text-sm">
                      {record.user?.display_name || record.user?.username || record.detected_name}
                    </span>
                  ))}
                </div>

                {/* Actions für Offiziere */}
                {canCreate && (
                  <div className="flex flex-wrap gap-2">
                    {/* Bearbeiten (kombiniertes Modal) */}
                    <button
                      onClick={() => openEditModal(session)}
                      className="btn bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-2"
                    >
                      <Edit3 size={16} />
                      {session.is_confirmed ? 'Ansehen' : 'Bearbeiten'}
                    </button>

                    {/* Loot-Session erstellen */}
                    {!session.has_loot_session && (
                      <button
                        onClick={() => createLootSessionMutation.mutate(session.id)}
                        disabled={createLootSessionMutation.isPending}
                        className="btn bg-krt-orange hover:bg-krt-orange/80 text-sm flex items-center gap-2"
                      >
                        <Package size={16} />
                        Loot-Session erstellen
                      </button>
                    )}

                    {/* Zur Loot-Session */}
                    {session.has_loot_session && session.loot_session_id && (
                      <a
                        href={`/loot?session=${session.loot_session_id}`}
                        className="btn bg-krt-orange hover:bg-krt-orange/80 text-sm flex items-center gap-2"
                      >
                        <Package size={16} />
                        Zur Loot-Session
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Kombiniertes Edit-Modal (OCR + Teilnehmer + Bestätigen) */}
      {editingSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Edit3 size={24} />
                Session bearbeiten
                {editingSession.is_confirmed && (
                  <span className="text-sm font-normal text-green-500 flex items-center gap-1">
                    <CheckCircle size={16} /> Bestätigt
                  </span>
                )}
              </h2>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Session-Info */}
            <div className="mb-6 p-4 bg-gray-800/50 rounded-lg">
              <p className="text-lg">
                {new Date(editingSession.date).toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              {editingSession.notes && (
                <p className="text-sm text-gray-400 mt-1">Notizen: {editingSession.notes}</p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                Erstellt von {editingSession.created_by.display_name || editingSession.created_by.username}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Linke Spalte: Screenshot + OCR */}
              <div className="space-y-4">
                {/* Screenshot */}
                {editScreenshotUrl && (
                  <div>
                    <h3 className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                      <Image size={16} />
                      Screenshot
                    </h3>
                    <img
                      src={editScreenshotUrl}
                      alt="Session Screenshot"
                      className="w-full rounded-lg border border-gray-700"
                    />
                  </div>
                )}

                {/* OCR-Daten: Automatisch zugeordnet */}
                {editOcrData && editOcrData.matched.length > 0 && (
                  <div>
                    <p className="text-sm text-green-500 mb-2 flex items-center gap-2">
                      <Check size={16} />
                      OCR automatisch zugeordnet ({editOcrData.matched.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {editOcrData.matched.map((m) => (
                        <span
                          key={m.user_id}
                          className="px-3 py-1 bg-green-900/30 border border-green-700 rounded-full text-sm text-green-300"
                        >
                          {m.display_name || m.username} ← "{m.detected_name}"
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* OCR-Daten: Nicht zugeordnet - Interaktiv */}
                {editOcrData && editOcrData.unmatched.length > 0 && (
                  <div>
                    <p className="text-sm text-yellow-500 mb-3 flex items-center gap-2">
                      <UserPlus size={16} />
                      OCR nicht zugeordnet ({editOcrData.unmatched.length}):
                    </p>
                    <div className="space-y-2">
                      {editOcrData.unmatched.map((name) => (
                        <div key={name} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-yellow-300 font-medium min-w-[100px] text-sm">"{name}"</span>
                            <select
                              value={ocrAssignments[name]?.userId || ''}
                              onChange={(e) => {
                                const userId = e.target.value ? parseInt(e.target.value) : null
                                setOcrAssignments((prev) => ({
                                  ...prev,
                                  [name]: { userId, saveAsAlias: prev[name]?.saveAsAlias || false },
                                }))
                              }}
                              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm"
                            >
                              <option value="">-- Ignorieren --</option>
                              {allUsers
                                ?.filter((u) => !editSelectedUsers.includes(u.id))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.display_name || u.username}
                                  </option>
                                ))}
                            </select>
                          </div>
                          {ocrAssignments[name]?.userId && (
                            <label className="flex items-center gap-2 text-sm text-gray-400 ml-[112px]">
                              <input
                                type="checkbox"
                                checked={ocrAssignments[name]?.saveAsAlias || false}
                                onChange={(e) => {
                                  setOcrAssignments((prev) => ({
                                    ...prev,
                                    [name]: { ...prev[name], saveAsAlias: e.target.checked },
                                  }))
                                }}
                                className="rounded bg-gray-700 border-gray-600"
                              />
                              Als Alias speichern
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                    {Object.values(ocrAssignments).some((v) => v.userId !== null) && (
                      <button
                        onClick={saveOcrAssignments}
                        disabled={addRecordMutation.isPending || addAliasMutation.isPending}
                        className="btn btn-primary mt-3 w-full flex items-center justify-center gap-2"
                      >
                        <Check size={16} />
                        {addRecordMutation.isPending || addAliasMutation.isPending
                          ? 'Speichern...'
                          : 'OCR-Zuordnungen übernehmen'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Rechte Spalte: Teilnehmer verwalten */}
              <div className="space-y-4">
                {/* Aktuelle Teilnehmer */}
                <div>
                  <h3 className="text-sm text-gray-400 mb-2">
                    Aktuelle Teilnehmer ({editingSession.records.length})
                  </h3>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-gray-800/30 rounded-lg">
                    {editingSession.records.length === 0 ? (
                      <span className="text-gray-500 text-sm">Keine Teilnehmer</span>
                    ) : (
                      editingSession.records.map((record) => (
                        <div
                          key={record.id}
                          className="flex items-center gap-2 px-3 py-1 bg-krt-orange/20 border border-krt-orange rounded-full text-sm"
                        >
                          <span>
                            {record.user?.display_name || record.user?.username || record.detected_name}
                          </span>
                          {!editingSession.is_confirmed && (
                            <button
                              onClick={() => handleRemoveUserFromSession(record.id, record.user?.id || 0)}
                              disabled={removeRecordMutation.isPending}
                              className="text-red-400 hover:text-red-300"
                              title="Entfernen"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* User hinzufügen */}
                {!editingSession.is_confirmed && (
                  <div>
                    <h3 className="text-sm text-gray-400 mb-2">User hinzufügen</h3>
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 bg-gray-800/30 rounded-lg">
                      {allUsers
                        ?.filter((u) => !editSelectedUsers.includes(u.id))
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAddUserToSession(u.id)}
                            disabled={addRecordMutation.isPending}
                            className="flex items-center gap-2 p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
                          >
                            <Plus size={14} />
                            <span className="truncate">{u.display_name || u.username}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer mit Actions */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              {/* Bestätigungs-Warnung */}
              {!editingSession.is_confirmed && editScreenshotUrl && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg mb-4">
                  <p className="text-yellow-400 text-sm">
                    <strong>Hinweis:</strong> Nach der Bestätigung wird der Screenshot gelöscht.
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                {/* Löschen-Button links (nur Admin) */}
                <div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteSession(editingSession.id)}
                      disabled={deleteSessionMutation.isPending}
                      className="btn bg-red-600 hover:bg-red-700 flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      {deleteSessionMutation.isPending ? 'Löschen...' : 'Session löschen'}
                    </button>
                  )}
                </div>

                {/* Andere Buttons rechts */}
                <div className="flex gap-3">
                  <button onClick={closeEditModal} className="btn bg-gray-700 hover:bg-gray-600">
                    Schließen
                  </button>
                  {!editingSession.is_confirmed && (
                    <button
                      onClick={handleConfirmSession}
                      disabled={confirmMutation.isPending || editingSession.records.length === 0}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      <CheckCircle size={16} />
                      {confirmMutation.isPending ? 'Wird bestätigt...' : 'Session bestätigen'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
