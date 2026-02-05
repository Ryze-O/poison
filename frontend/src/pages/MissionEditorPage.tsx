import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { apiClient } from '../api/client'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  MapPin,
  HelpCircle,
  Grip,
  X,
} from 'lucide-react'
import type {
  MissionDetail,
  MissionTemplate,
  MissionCreate,
  MissionUnitCreate,
  MissionPositionCreate,
  MissionPhaseCreate,
  Location,
} from '../api/types'
import GroupedLocationSelect from '../components/GroupedLocationSelect'

type WizardStep = 1 | 2 | 3 | 4

// Standard-Funkfrequenzen (Basis)
const BASE_FREQUENCY_PRESETS = {
  el: { label: 'Einsatzleitung', options: ['102.11', '102.12'] },
  intern: { label: 'Intern', options: ['102.31', '102.32', '102.51', '102.52', '102.61', '102.62', '102.70'] },
  targets: { label: 'Targets', options: ['102.91', '102.92'] },
}

// LocalStorage Key für benutzerdefinierte Frequenzen
const CUSTOM_FREQUENCIES_KEY = 'poison_custom_frequencies'

// Lade benutzerdefinierte Frequenzen aus localStorage
const loadCustomFrequencies = (): Record<string, string[]> => {
  try {
    const stored = localStorage.getItem(CUSTOM_FREQUENCIES_KEY)
    return stored ? JSON.parse(stored) : { el: [], intern: [], targets: [] }
  } catch {
    return { el: [], intern: [], targets: [] }
  }
}

// Speichere benutzerdefinierte Frequenz
const saveCustomFrequency = (key: string, frequency: string) => {
  if (!frequency || frequency.trim() === '') return

  const custom = loadCustomFrequencies()
  const baseOptions = BASE_FREQUENCY_PRESETS[key as keyof typeof BASE_FREQUENCY_PRESETS]?.options || []

  // Nur speichern wenn es keine Standard-Frequenz ist und noch nicht gespeichert wurde
  if (!baseOptions.includes(frequency) && !custom[key]?.includes(frequency)) {
    if (!custom[key]) custom[key] = []
    custom[key].push(frequency)
    // Maximal 10 Custom-Frequenzen pro Kategorie speichern
    if (custom[key].length > 10) custom[key] = custom[key].slice(-10)
    localStorage.setItem(CUSTOM_FREQUENCIES_KEY, JSON.stringify(custom))
  }
}

// Kombiniere Basis-Presets mit benutzerdefinierten Frequenzen
const getFrequencyPresets = () => {
  const custom = loadCustomFrequencies()
  return {
    el: {
      label: 'Einsatzleitung',
      options: [...BASE_FREQUENCY_PRESETS.el.options, ...custom.el.filter(f => !BASE_FREQUENCY_PRESETS.el.options.includes(f))],
    },
    intern: {
      label: 'Intern',
      options: [...BASE_FREQUENCY_PRESETS.intern.options, ...custom.intern.filter(f => !BASE_FREQUENCY_PRESETS.intern.options.includes(f))],
    },
    targets: {
      label: 'Targets',
      options: [...BASE_FREQUENCY_PRESETS.targets.options, ...custom.targets.filter(f => !BASE_FREQUENCY_PRESETS.targets.options.includes(f))],
    },
  }
}

interface LocalUnit extends MissionUnitCreate {
  _localId: string
  crew_count: number
  positions: (MissionPositionCreate & { _localId: string })[]
}

interface LocalPhase extends MissionPhaseCreate {
  _localId: string
}

interface LocalMissionData {
  title: string
  // Strukturierte Beschreibungsfelder
  mission_context: string
  mission_objective: string
  preparation_notes: string
  special_notes: string
  scheduled_date: string
  scheduled_time: string
  duration_hours: number
  duration_minutes: number
  start_location_id: number | null
  equipment_level: string
  target_group: string
  rules_of_engagement: string
}

const generateLocalId = () => Math.random().toString(36).substring(2, 11)

// Helper function to compute unit display name from unit_type and ship_name
const getUnitDisplayName = (unit: { unit_type?: string | null; ship_name?: string | null }, index: number): string => {
  if (unit.unit_type && unit.ship_name) {
    return `${unit.unit_type} ${unit.ship_name}`
  } else if (unit.unit_type) {
    return unit.unit_type
  } else if (unit.ship_name) {
    return unit.ship_name
  }
  return `Einheit ${index + 1}`
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-gray-400 hover:text-gray-300"
      >
        <HelpCircle size={14} />
      </button>
      {show && (
        <div className="absolute z-50 left-6 top-0 w-64 p-2 bg-gray-800 border border-gray-600 rounded shadow-lg text-xs text-gray-300">
          {text}
        </div>
      )}
    </div>
  )
}

export default function MissionEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('template')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = !!id

  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    templateId ? Number(templateId) : null
  )

  // Local state for the mission data
  const [missionData, setMissionData] = useState<LocalMissionData>({
    title: '',
    mission_context: '',
    mission_objective: '',
    preparation_notes: '',
    special_notes: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: '19:45',
    duration_hours: 2,
    duration_minutes: 30,
    start_location_id: null,
    equipment_level: '',
    target_group: '',
    rules_of_engagement: '',
  })

  const [units, setUnits] = useState<LocalUnit[]>([])
  const [phases, setPhases] = useState<LocalPhase[]>([])
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())

  // New location form state
  const [showNewLocationForm, setShowNewLocationForm] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationSystem, setNewLocationSystem] = useState('')

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Fetch existing mission if editing
  const { data: existingMission, isLoading: missionLoading } = useQuery<MissionDetail>({
    queryKey: ['mission', id],
    queryFn: () => apiClient.get(`/api/missions/${id}`).then((r) => r.data),
    enabled: isEditing,
  })

  // Fetch templates
  const { data: templates } = useQuery<MissionTemplate[]>({
    queryKey: ['mission-templates'],
    queryFn: () => apiClient.get('/api/missions/templates').then((r) => r.data),
  })

  // Fetch locations
  const { data: locations } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiClient.get('/api/locations').then((r) => r.data),
  })

  // Fetch operational roles from Viper Structure for position type suggestions
  // Populate form with existing mission data
  useEffect(() => {
    if (existingMission) {
      const date = new Date(existingMission.scheduled_date)
      setMissionData({
        title: existingMission.title,
        mission_context: existingMission.mission_context || '',
        mission_objective: existingMission.mission_objective || '',
        preparation_notes: existingMission.preparation_notes || '',
        special_notes: existingMission.special_notes || '',
        scheduled_date: date.toISOString().split('T')[0],
        scheduled_time: date.toTimeString().slice(0, 5),
        duration_hours: Math.floor((existingMission.duration_minutes || 0) / 60),
        duration_minutes: (existingMission.duration_minutes || 0) % 60,
        start_location_id: existingMission.start_location_id,
        equipment_level: existingMission.equipment_level || '',
        target_group: existingMission.target_group || '',
        rules_of_engagement: existingMission.rules_of_engagement || '',
      })

      // Convert existing units to local format
      setUnits(
        existingMission.units.map((unit) => ({
          _localId: `existing-${unit.id}`,
          name: unit.name,
          unit_type: unit.unit_type,
          description: unit.description,
          ship_name: unit.ship_name,
          ship_id: unit.ship_id,
          radio_frequencies: unit.radio_frequencies,
          sort_order: unit.sort_order,
          crew_count: unit.crew_count || 1,
          positions: unit.positions.map((pos) => ({
            _localId: `existing-${pos.id}`,
            name: pos.name,
            position_type: pos.position_type,
            is_required: pos.is_required,
            min_count: pos.min_count,
            max_count: pos.max_count,
            required_role_id: pos.required_role_id,
            notes: pos.notes,
            sort_order: pos.sort_order,
          })),
        }))
      )

      // Convert existing phases
      setPhases(
        existingMission.phases.map((phase) => ({
          _localId: `existing-${phase.id}`,
          phase_number: phase.phase_number,
          title: phase.title,
          description: phase.description,
          start_time: phase.start_time,
          sort_order: phase.sort_order,
        }))
      )

      // Expand all units by default when editing
      setExpandedUnits(new Set(existingMission.units.map((u) => `existing-${u.id}`)))
    }
  }, [existingMission])

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplateId && templates && !isEditing) {
      const template = templates.find((t) => t.id === selectedTemplateId)
      if (template?.template_data) {
        const data = template.template_data as {
          units?: Array<{
            name: string
            unit_type?: string
            ship_name?: string
            radio_frequencies?: Record<string, string>
            positions?: Array<{
              name: string
              position_type?: string
              is_required?: boolean
              min_count?: number
              max_count?: number
            }>
          }>
          phases?: Array<{
            phase_number: number
            title: string
            description?: string
          }>
        }

        // Apply template units
        if (data.units) {
          const newUnits: LocalUnit[] = data.units.map((u, idx) => ({
            _localId: generateLocalId(),
            name: u.name,
            unit_type: u.unit_type || null,
            ship_name: u.ship_name || null,
            ship_id: null,
            radio_frequencies: u.radio_frequencies || null,
            sort_order: idx,
            crew_count: 1,
            positions:
              u.positions?.map((p, pidx) => ({
                _localId: generateLocalId(),
                name: p.name,
                position_type: p.position_type || null,
                is_required: p.is_required ?? true,
                min_count: p.min_count ?? 1,
                max_count: p.max_count ?? 1,
                required_role_id: null,
                notes: null,
                sort_order: pidx,
              })) || [],
          }))
          setUnits(newUnits)
          setExpandedUnits(new Set(newUnits.map((u) => u._localId)))
        }

        // Apply template phases
        if (data.phases) {
          setPhases(
            data.phases.map((p, idx) => ({
              _localId: generateLocalId(),
              phase_number: p.phase_number,
              title: p.title,
              description: p.description || null,
              start_time: null,
              sort_order: idx,
            }))
          )
        }
      }
    }
  }, [selectedTemplateId, templates, isEditing])

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: MissionCreate) => {
      const response = await apiClient.post('/api/missions', data)
      return response.data
    },
    onSuccess: (newMission) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      // After creating, save units and phases
      saveUnitsAndPhases(newMission.id)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<LocalMissionData> }) => {
      const payload = {
        title: data.updates.title,
        mission_context: data.updates.mission_context || null,
        mission_objective: data.updates.mission_objective || null,
        preparation_notes: data.updates.preparation_notes || null,
        special_notes: data.updates.special_notes || null,
        scheduled_date: `${data.updates.scheduled_date}T${data.updates.scheduled_time}:00`,
        duration_minutes:
          (data.updates.duration_hours || 0) * 60 + (data.updates.duration_minutes || 0),
        start_location_id: data.updates.start_location_id,
        equipment_level: data.updates.equipment_level || null,
        target_group: data.updates.target_group || null,
        rules_of_engagement: data.updates.rules_of_engagement || null,
      }
      const response = await apiClient.patch(`/api/missions/${data.id}`, payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
      saveUnitsAndPhases(Number(id))
    },
  })

  // Create new location
  const createLocationMutation = useMutation({
    mutationFn: (data: { name: string; system_name?: string }) =>
      apiClient.post('/api/locations', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Automatically select the new location
      setMissionData({ ...missionData, start_location_id: response.data.id })
      // Reset form
      setShowNewLocationForm(false)
      setNewLocationName('')
      setNewLocationSystem('')
    },
  })

  // Delete mission
  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/missions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      navigate('/einsaetze')
    },
  })

  const saveUnitsAndPhases = async (missionId: number) => {
    // Delete existing units and recreate (simpler than diffing)
    if (isEditing && existingMission) {
      // Delete old units
      for (const unit of existingMission.units) {
        await apiClient.delete(`/api/missions/${missionId}/units/${unit.id}`)
      }
      // Delete old phases
      for (const phase of existingMission.phases) {
        await apiClient.delete(`/api/missions/${missionId}/phases/${phase.id}`)
      }
    }

    // Create new units with positions
    for (const unit of units) {
      await apiClient.post(`/api/missions/${missionId}/units`, {
        name: unit.name,
        unit_type: unit.unit_type,
        description: unit.description,
        ship_name: unit.ship_name,
        ship_id: unit.ship_id,
        radio_frequencies: unit.radio_frequencies,
        sort_order: unit.sort_order,
        crew_count: unit.crew_count,
        positions: unit.positions.map((p, idx) => ({
          // Filter out '__custom__' marker and empty strings - use fallback name
          name: (!p.name || p.name === '__custom__') ? `Position ${idx + 1}` : p.name,
          position_type: p.position_type === '__custom__' ? null : p.position_type,
          is_required: p.is_required,
          min_count: p.min_count,
          max_count: p.max_count,
          required_role_id: p.required_role_id,
          notes: p.notes,
          sort_order: p.sort_order,
        })),
      })
    }

    // Create phases
    for (const phase of phases) {
      await apiClient.post(`/api/missions/${missionId}/phases`, {
        phase_number: phase.phase_number,
        title: phase.title,
        description: phase.description,
        start_time: phase.start_time,
        sort_order: phase.sort_order,
      })
    }

    // Navigate to detail page
    navigate(`/einsaetze/${missionId}`)
  }

  const handleSave = () => {
    const payload: MissionCreate = {
      title: missionData.title,
      mission_context: missionData.mission_context || null,
      mission_objective: missionData.mission_objective || null,
      preparation_notes: missionData.preparation_notes || null,
      special_notes: missionData.special_notes || null,
      scheduled_date: `${missionData.scheduled_date}T${missionData.scheduled_time}:00`,
      duration_minutes: missionData.duration_hours * 60 + missionData.duration_minutes,
      start_location_id: missionData.start_location_id,
      equipment_level: missionData.equipment_level || null,
      target_group: missionData.target_group || null,
      rules_of_engagement: missionData.rules_of_engagement || null,
      template_id: selectedTemplateId,
    }

    if (isEditing) {
      updateMutation.mutate({ id: Number(id), updates: missionData })
    } else {
      createMutation.mutate(payload)
    }
  }

  // Unit management
  const addUnit = () => {
    const newUnit: LocalUnit = {
      _localId: generateLocalId(),
      name: `Kategorie ${units.length + 1}`,
      unit_type: null,
      description: null,
      ship_name: null,
      ship_id: null,
      radio_frequencies: null,
      sort_order: units.length,
      crew_count: 1,
      positions: [], // Positionen werden beim Zuweisen erstellt
    }
    setUnits([...units, newUnit])
    setExpandedUnits(new Set([...expandedUnits, newUnit._localId]))
  }

  const removeUnit = (localId: string) => {
    setUnits(units.filter((u) => u._localId !== localId))
    const newExpanded = new Set(expandedUnits)
    newExpanded.delete(localId)
    setExpandedUnits(newExpanded)
  }

  const updateUnit = (localId: string, updates: Partial<LocalUnit>) => {
    setUnits(units.map((u) => {
      if (u._localId !== localId) return u

      const updatedUnit = { ...u, ...updates }

      // Auto-update name based on unit_type and ship_name
      const newUnitType = updates.unit_type !== undefined ? updates.unit_type : u.unit_type
      const newShipName = updates.ship_name !== undefined ? updates.ship_name : u.ship_name
      if (newUnitType && newShipName) {
        updatedUnit.name = `${newUnitType} ${newShipName}`
      } else if (newUnitType) {
        updatedUnit.name = newUnitType
      } else if (newShipName) {
        updatedUnit.name = newShipName
      }

      return updatedUnit
    }))
  }

  const setFrequency = (localId: string, key: string, value: string) => {
    // Custom-Frequenz speichern (wenn nicht leer und nicht bereits ein Preset)
    if (value && value.trim() !== '') {
      saveCustomFrequency(key, value.trim())
    }

    setUnits(units.map((u) => {
      if (u._localId !== localId) return u
      const currentFreqs = u.radio_frequencies || {}
      if (value) {
        return { ...u, radio_frequencies: { ...currentFreqs, [key]: value } }
      } else {
        const { [key]: _, ...rest } = currentFreqs
        return { ...u, radio_frequencies: Object.keys(rest).length > 0 ? rest : null }
      }
    }))
  }

  // Phase management
  const addPhase = () => {
    setPhases([
      ...phases,
      {
        _localId: generateLocalId(),
        phase_number: phases.length + 1,
        title: `Phase ${phases.length + 1}`,
        description: null,
        start_time: null,
        sort_order: phases.length,
      },
    ])
  }

  const removePhase = (localId: string) => {
    setPhases(phases.filter((p) => p._localId !== localId))
  }

  const updatePhase = (localId: string, updates: Partial<LocalPhase>) => {
    setPhases(phases.map((p) => (p._localId === localId ? { ...p, ...updates } : p)))
  }

  // Frequency helpers
  const toggleUnitExpanded = (localId: string) => {
    const newExpanded = new Set(expandedUnits)
    if (newExpanded.has(localId)) {
      newExpanded.delete(localId)
    } else {
      newExpanded.add(localId)
    }
    setExpandedUnits(newExpanded)
  }

  // Validation
  const canProceedStep1 = missionData.title.trim().length > 0 && missionData.scheduled_date
  const canProceedStep2 = units.length > 0 && units.every((u) => u.name.trim().length > 0)
  const canProceedStep3 = true // Phases are optional

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isEditing && missionLoading) {
    return <div className="text-center py-8 text-gray-400">Lade Einsatz...</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/einsaetze"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-primary mb-4"
        >
          <ArrowLeft size={20} />
          Zurück zur Übersicht
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {isEditing ? 'Einsatz bearbeiten' : 'Neuer Einsatz'}
          </h1>
          {isEditing && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-600/50 text-red-400 rounded hover:bg-red-600/30"
            >
              <Trash2 size={18} />
              Einsatz löschen
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex-1 flex items-center">
              <button
                onClick={() => {
                  if (step === 1) setCurrentStep(1)
                  else if (step === 2 && canProceedStep1) setCurrentStep(2)
                  else if (step === 3 && canProceedStep1 && canProceedStep2) setCurrentStep(3)
                  else if (step === 4 && canProceedStep1 && canProceedStep2 && canProceedStep3)
                    setCurrentStep(4)
                }}
                className={`flex items-center gap-2 ${
                  currentStep === step
                    ? 'text-krt-orange'
                    : currentStep > step
                      ? 'text-green-500'
                      : 'text-gray-500'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    currentStep === step
                      ? 'border-krt-orange bg-krt-orange/20'
                      : currentStep > step
                        ? 'border-green-500 bg-green-500/20'
                        : 'border-gray-600'
                  }`}
                >
                  {currentStep > step ? <Check size={16} /> : step}
                </div>
                <span className="hidden md:inline text-sm">
                  {step === 1 && 'Start'}
                  {step === 2 && 'Einheiten'}
                  {step === 3 && 'Ablauf'}
                  {step === 4 && 'Prüfen'}
                </span>
              </button>
              {step < 4 && <div className="flex-1 h-px bg-gray-700 mx-2" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Grundlagen */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Template Selection (only for new missions) */}
          {!isEditing && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold mb-4">
                Template wählen (optional)
                <InfoTooltip text="Templates enthalten vordefinierte Einheiten und Phasen, die du nach der Auswahl anpassen kannst." />
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTemplateId(null)}
                  className={`px-4 py-2 rounded border ${
                    selectedTemplateId === null
                      ? 'border-krt-orange bg-krt-orange/20 text-krt-orange'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  Leer starten
                </button>
                {templates?.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`px-4 py-2 rounded border ${
                      selectedTemplateId === template.id
                        ? 'border-krt-orange bg-krt-orange/20 text-krt-orange'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
              {selectedTemplateId && templates && (
                <p className="mt-2 text-sm text-gray-400">
                  {templates.find((t) => t.id === selectedTemplateId)?.description}
                </p>
              )}
            </div>
          )}

          {/* Basic Data */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Grunddaten</h2>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Titel *
                <InfoTooltip text="Kurzer, prägnanter Name für den Einsatz. Beispiel: 'Loot Run Pyro', 'PvP Training Stanton'" />
              </label>
              <input
                type="text"
                value={missionData.title}
                onChange={(e) => setMissionData({ ...missionData, title: e.target.value })}
                placeholder="z.B. Hunt for Decari Pods"
                className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Datum *
                  <InfoTooltip text="An welchem Tag findet der Einsatz statt?" />
                </label>
                <input
                  type="date"
                  value={missionData.scheduled_date}
                  onChange={(e) =>
                    setMissionData({ ...missionData, scheduled_date: e.target.value })
                  }
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Uhrzeit *
                  <InfoTooltip text="Wann soll der Einsatz beginnen?" />
                </label>
                <input
                  type="time"
                  value={missionData.scheduled_time}
                  onChange={(e) =>
                    setMissionData({ ...missionData, scheduled_time: e.target.value })
                  }
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Dauer (Stunden)
                  <InfoTooltip text="Wie lange wird der Einsatz ungefähr dauern?" />
                </label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={missionData.duration_hours}
                  onChange={(e) =>
                    setMissionData({ ...missionData, duration_hours: Number(e.target.value) })
                  }
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Minuten</label>
                <select
                  value={missionData.duration_minutes}
                  onChange={(e) =>
                    setMissionData({ ...missionData, duration_minutes: Number(e.target.value) })
                  }
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value={0}>0</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Verortung / Treffpunkt
                <InfoTooltip text="Wo findet der Einsatz statt? Wo sollen sich alle Teilnehmer sammeln?" />
              </label>
              <div className="flex gap-2">
                <GroupedLocationSelect
                  locations={locations || []}
                  value={missionData.start_location_id}
                  onChange={(locationId) =>
                    setMissionData({
                      ...missionData,
                      start_location_id: locationId,
                    })
                  }
                  placeholder="Keine Verortung angegeben"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowNewLocationForm(true)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 text-sm whitespace-nowrap"
                >
                  <Plus size={16} className="inline mr-1" />
                  Neuer Ort
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Ausrüstung
                <InfoTooltip text="Welche Ausrüstungsstufe wird benötigt? Klicke auf die Vorschläge oder kombiniere mehrere." />
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {['Viper Base Gear', 'Viper Heavy Gear'].map((preset) => {
                  const isSelected = missionData.equipment_level.includes(preset)
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          // Remove preset
                          const newValue = missionData.equipment_level
                            .split(', ')
                            .filter((p) => p !== preset)
                            .join(', ')
                          setMissionData({ ...missionData, equipment_level: newValue })
                        } else {
                          // Add preset
                          const newValue = missionData.equipment_level
                            ? `${missionData.equipment_level}, ${preset}`
                            : preset
                          setMissionData({ ...missionData, equipment_level: newValue })
                        }
                      }}
                      className={`px-3 py-1 rounded text-sm border ${
                        isSelected
                          ? 'bg-krt-orange/20 border-krt-orange text-krt-orange'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      }`}
                    >
                      {preset}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={missionData.equipment_level}
                onChange={(e) => setMissionData({ ...missionData, equipment_level: e.target.value })}
                placeholder="Oder eigene Ausrüstung eingeben..."
                className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Zielgruppe
                <InfoTooltip text="Stufe 1: Anfänger willkommen | Stufe 2: Einsatzerfahrung empfohlen | Stufe 3: Einsatzerfahrung zwingend erforderlich" />
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { value: 'Stufe 1: Anfänger willkommen', short: 'Stufe 1' },
                  { value: 'Stufe 2: Einsatzerfahrung empfohlen', short: 'Stufe 2' },
                  { value: 'Stufe 3: Einsatzerfahrung zwingend erforderlich', short: 'Stufe 3' },
                ].map((level) => {
                  const isSelected = missionData.target_group === level.value
                  return (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setMissionData({ ...missionData, target_group: '' })
                        } else {
                          setMissionData({ ...missionData, target_group: level.value })
                        }
                      }}
                      className={`px-3 py-1 rounded text-sm border ${
                        isSelected
                          ? 'bg-krt-orange/20 border-krt-orange text-krt-orange'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      }`}
                      title={level.value}
                    >
                      {level.short}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={missionData.target_group}
                onChange={(e) => setMissionData({ ...missionData, target_group: e.target.value })}
                placeholder="Oder eigene Zielgruppe eingeben..."
                className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Rules of Engagement (ROE)
                <InfoTooltip text="Weapons Hold: Nur schießen auf Befehl | Weapons Tight: Reaktiv handeln, dem Handeln des Gegners angepasst | Weapons Free: Ich schieße auf alles" />
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { value: 'Weapons Hold', tooltip: 'Nur schießen auf Befehl' },
                  { value: 'Weapons Tight', tooltip: 'Reaktiv handeln, dem Handeln des Gegners angepasst' },
                  { value: 'Weapons Free', tooltip: 'Ich schieße auf alles' },
                ].map((roe) => {
                  const isSelected = missionData.rules_of_engagement === roe.value
                  return (
                    <button
                      key={roe.value}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setMissionData({ ...missionData, rules_of_engagement: '' })
                        } else {
                          setMissionData({ ...missionData, rules_of_engagement: roe.value })
                        }
                      }}
                      className={`px-3 py-1 rounded text-sm border ${
                        isSelected
                          ? 'bg-krt-orange/20 border-krt-orange text-krt-orange'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      }`}
                      title={roe.tooltip}
                    >
                      {roe.value}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={missionData.rules_of_engagement}
                onChange={(e) =>
                  setMissionData({ ...missionData, rules_of_engagement: e.target.value })
                }
                placeholder="Oder eigene ROE eingeben..."
                className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            {/* Strukturierte Beschreibungsfelder */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-md font-semibold mb-4 text-gray-300">Beschreibung (strukturiert)</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Kontext / Hintergrund
                    <InfoTooltip text="Warum findet dieser Einsatz statt? Lore, Situation, Vorgeschichte. Beispiel: 'Die Situation um die Molina Mold spitzt sich zu...'" />
                  </label>
                  <textarea
                    value={missionData.mission_context}
                    onChange={(e) => setMissionData({ ...missionData, mission_context: e.target.value })}
                    placeholder="z.B. Die Situation um die Molina Mold spitzt sich zu. Staffel Viper hat am Samstag geholfen, Hilfsgüter sicherzustellen..."
                    rows={3}
                    className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Einsatzziel
                    <InfoTooltip text="Was ist das Hauptziel? Was wollen wir erreichen? Beispiel: 'Jagd nach Decari Pods auf Bloom (Pyro). Störer vertreiben.'" />
                  </label>
                  <textarea
                    value={missionData.mission_objective}
                    onChange={(e) => setMissionData({ ...missionData, mission_objective: e.target.value })}
                    placeholder="z.B. Jagd nach Decari Pods auf Bloom (Pyro). Jeden Störer vertreiben und notfalls beseitigen."
                    rows={2}
                    className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Vorbereitung
                    <InfoTooltip text="Was müssen Teilnehmer vorbereiten oder mitbringen? Beispiel: 'Schiffe nach Orbituary claimen mit Meta-Fit. Jäger mit Ballistic-Fits.'" />
                  </label>
                  <textarea
                    value={missionData.preparation_notes}
                    onChange={(e) => setMissionData({ ...missionData, preparation_notes: e.target.value })}
                    placeholder="z.B. Claimt alle Schiffe nach Orbituary mit Meta-Fit. Jäger bitte mit Ballistic- und Anti-GKS-Fits."
                    rows={2}
                    className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Besondere Hinweise (optional)
                    <InfoTooltip text="Risiken, Warnungen, Sonderregeln über ROE hinaus. Beispiel: 'Kein Boarding, kein Finishen. Reparaturzeit wird gewährt.'" />
                  </label>
                  <textarea
                    value={missionData.special_notes}
                    onChange={(e) => setMissionData({ ...missionData, special_notes: e.target.value })}
                    placeholder="z.B. Kein Boarding, kein Finishen von Schiffen. Infektionsgefahr bei Höhlenoperation!"
                    rows={2}
                    className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Anmeldekategorien */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Anmeldekategorien
              <InfoTooltip text="Kategorien sind die Gruppen, auf die sich User anmelden können (z.B. GKS, Jäger, FPS Squad). Die genaue Rollenzuweisung erfolgt später." />
            </h2>
            <button
              onClick={addUnit}
              className="flex items-center gap-2 px-3 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
            >
              <Plus size={16} />
              Kategorie hinzufügen
            </button>
          </div>

          {units.length === 0 && (
            <div className="bg-krt-dark rounded-lg border border-dashed border-gray-600 p-8 text-center">
              <Users size={48} className="mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400 mb-4">Noch keine Anmeldekategorien vorhanden</p>
              <button
                onClick={addUnit}
                className="inline-flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
              >
                <Plus size={16} />
                Erste Kategorie erstellen
              </button>
            </div>
          )}

          {units.map((unit) => (
            <div key={unit._localId} className="bg-krt-dark rounded-lg border border-gray-700">
              {/* Category Header */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={() => toggleUnitExpanded(unit._localId)}
              >
                <Grip size={16} className="text-gray-500" />
                <div className="flex-1">
                  <span className="font-semibold text-white">
                    {getUnitDisplayName(unit, units.indexOf(unit))}
                  </span>
                </div>
                <span className="text-sm text-gray-400">{unit.crew_count} Plätze</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeUnit(unit._localId)
                  }}
                  className="p-1 text-gray-400 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
                {expandedUnits.has(unit._localId) ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>

              {/* Category Details (expanded) */}
              {expandedUnits.has(unit._localId) && (
                <div className="border-t border-gray-700 p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Kategorie
                        <InfoTooltip text="Art der Kategorie, z.B. GKS, Jäger, Squad, BEAST, DEALS - oder eigenen Typ eingeben" />
                      </label>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {['GKS', 'Jäger', 'Squad', 'BEAST', 'DEALS'].map((preset) => {
                          const isSelected = unit.unit_type === preset
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  updateUnit(unit._localId, { unit_type: null })
                                } else {
                                  updateUnit(unit._localId, { unit_type: preset })
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-xs border ${
                                isSelected
                                  ? 'bg-krt-orange/20 border-krt-orange text-krt-orange'
                                  : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                              }`}
                            >
                              {preset}
                            </button>
                          )
                        })}
                      </div>
                      <input
                        type="text"
                        value={unit.unit_type || ''}
                        onChange={(e) =>
                          updateUnit(unit._localId, { unit_type: e.target.value || null })
                        }
                        placeholder="Oder eigenen Typ eingeben..."
                        className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Besatzung
                        <InfoTooltip text="Wie viele Plätze hat diese Kategorie? User können sich darauf anmelden." />
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={unit.crew_count}
                        onChange={(e) =>
                          updateUnit(unit._localId, { crew_count: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Schiff (optional)
                        <InfoTooltip text="Welches Schiff nutzt diese Kategorie? z.B. 'Polaris', 'Idris', 'Hercules C2'" />
                      </label>
                      <input
                        type="text"
                        value={unit.ship_name || ''}
                        onChange={(e) =>
                          updateUnit(unit._localId, { ship_name: e.target.value || null })
                        }
                        placeholder="z.B. Polaris"
                        className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  {/* Funkfrequenzen */}
                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Funkfrequenzen (optional)
                      <InfoTooltip text="Lege Funkfrequenzen für diese Einheit fest. Custom-Frequenzen werden automatisch für zukünftige Einsätze gespeichert." />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(getFrequencyPresets()).map(([key, preset]) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1">{preset.label}</label>
                          <div className="flex gap-1">
                            <select
                              value={unit.radio_frequencies?.[key] || ''}
                              onChange={(e) => setFrequency(unit._localId, key, e.target.value)}
                              className="flex-1 bg-krt-dark border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                            >
                              <option value="">—</option>
                              {preset.options.map((freq) => (
                                <option key={freq} value={freq}>
                                  {freq}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={unit.radio_frequencies?.[key] || ''}
                              onChange={(e) => setFrequency(unit._localId, key, e.target.value)}
                              placeholder="Custom"
                              className="w-20 bg-krt-dark border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step 3: Ablauf/Phasen */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Ablauf / Phasen
              <InfoTooltip text="Definiere die einzelnen Phasen des Einsatzes. z.B. 'Phase 1: Sammeln', 'Phase 2: Transit', 'Phase 3: Einsatz'" />
            </h2>
            <button
              onClick={addPhase}
              className="flex items-center gap-2 px-3 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
            >
              <Plus size={16} />
              Phase hinzufügen
            </button>
          </div>

          {phases.length === 0 && (
            <div className="bg-krt-dark rounded-lg border border-dashed border-gray-600 p-8 text-center">
              <Clock size={48} className="mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400 mb-4">
                Noch keine Phasen definiert (optional)
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Phasen helfen, den Einsatz zu strukturieren und den Ablauf zu planen.
              </p>
              <button
                onClick={addPhase}
                className="inline-flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80"
              >
                <Plus size={16} />
                Erste Phase erstellen
              </button>
            </div>
          )}

          {phases.map((phase, idx) => (
            <div
              key={phase._localId}
              className="bg-krt-dark rounded-lg border border-gray-700 p-4 space-y-3"
            >
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-krt-orange/20 border border-krt-orange flex items-center justify-center text-krt-orange font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={phase.title}
                      onChange={(e) => updatePhase(phase._localId, { title: e.target.value })}
                      placeholder="Phase Titel"
                      className="flex-1 bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                    />
                    <input
                      type="text"
                      value={phase.start_time || ''}
                      onChange={(e) =>
                        updatePhase(phase._localId, { start_time: e.target.value || null })
                      }
                      placeholder="Uhrzeit (z.B. 20:00)"
                      className="w-32 bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <textarea
                    value={phase.description || ''}
                    onChange={(e) =>
                      updatePhase(phase._localId, { description: e.target.value || null })
                    }
                    placeholder="Beschreibung der Phase..."
                    rows={2}
                    className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
                <button
                  onClick={() => removePhase(phase._localId)}
                  className="p-2 text-gray-400 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 4: Prüfen & Speichern */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Zusammenfassung</h2>

          {/* Mission Summary */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
            <h3 className="font-semibold text-krt-orange mb-4">{missionData.title || 'Kein Titel'}</h3>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-400" />
                <span>
                  {missionData.scheduled_date} um {missionData.scheduled_time} Uhr
                </span>
              </div>
              {(missionData.duration_hours > 0 || missionData.duration_minutes > 0) && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <span>
                    Dauer: {missionData.duration_hours > 0 && `${missionData.duration_hours}h `}
                    {missionData.duration_minutes > 0 && `${missionData.duration_minutes}min`}
                  </span>
                </div>
              )}
              {missionData.start_location_id && (
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-gray-400" />
                  <span>
                    {locations?.find((l) => l.id === missionData.start_location_id)?.name}
                  </span>
                </div>
              )}
              {missionData.target_group && (
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-400" />
                  <span>{missionData.target_group}</span>
                </div>
              )}
            </div>

            {/* Strukturierte Beschreibung */}
            {(missionData.mission_context || missionData.mission_objective || missionData.preparation_notes || missionData.special_notes) && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-3 text-sm">
                {missionData.mission_context && (
                  <div>
                    <span className="text-gray-400 font-medium">Hintergrund: </span>
                    <span className="text-gray-300">{missionData.mission_context}</span>
                  </div>
                )}
                {missionData.mission_objective && (
                  <div>
                    <span className="text-gray-400 font-medium">Einsatzziel: </span>
                    <span className="text-gray-300">{missionData.mission_objective}</span>
                  </div>
                )}
                {missionData.preparation_notes && (
                  <div>
                    <span className="text-gray-400 font-medium">Vorbereitung: </span>
                    <span className="text-gray-300">{missionData.preparation_notes}</span>
                  </div>
                )}
                {missionData.special_notes && (
                  <div>
                    <span className="text-krt-orange font-medium">⚠️ Hinweise: </span>
                    <span className="text-gray-300">{missionData.special_notes}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Units Summary */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
            <h3 className="font-semibold mb-4">
              {units.length} Einheit{units.length !== 1 && 'en'}
            </h3>
            <div className="space-y-2">
              {units.map((unit) => (
                <div key={unit._localId} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{unit.name}</span>
                  {unit.ship_name && <span className="text-gray-400">({unit.ship_name})</span>}
                  <span className="text-gray-500">- {unit.positions.length} Positionen</span>
                </div>
              ))}
              {units.length === 0 && (
                <p className="text-gray-400 text-sm">Keine Einheiten definiert</p>
              )}
            </div>
          </div>

          {/* Phases Summary */}
          {phases.length > 0 && (
            <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
              <h3 className="font-semibold mb-4">{phases.length} Phasen</h3>
              <div className="space-y-2">
                {phases.map((phase, idx) => (
                  <div key={phase._localId} className="flex items-center gap-2 text-sm">
                    <span className="w-6 h-6 rounded-full bg-krt-orange/20 text-krt-orange flex items-center justify-center text-xs">
                      {idx + 1}
                    </span>
                    <span>{phase.title}</span>
                    {phase.start_time && (
                      <span className="text-gray-400">({phase.start_time})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Actions */}
          <div className="bg-krt-dark rounded-lg border border-gray-700 p-6">
            <h3 className="font-semibold mb-4">Speichern</h3>
            <p className="text-sm text-gray-400 mb-4">
              Der Einsatz wird als <strong>Entwurf</strong> gespeichert. Du kannst ihn später
              veröffentlichen, damit sich Mitglieder anmelden können.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleSave}
                disabled={isSaving || !canProceedStep1}
                className="flex items-center gap-2 px-6 py-3 bg-krt-orange rounded hover:bg-krt-orange/80 disabled:opacity-50"
              >
                {isSaving ? (
                  <>Speichern...</>
                ) : (
                  <>
                    <Save size={20} />
                    {isEditing ? 'Änderungen speichern' : 'Einsatz erstellen'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t border-gray-700">
        <button
          onClick={() => setCurrentStep((currentStep - 1) as WizardStep)}
          disabled={currentStep === 1}
          className="flex items-center gap-2 px-4 py-2 bg-krt-dark border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          Zurück
        </button>

        {currentStep < 4 ? (
          <button
            onClick={() => setCurrentStep((currentStep + 1) as WizardStep)}
            disabled={
              (currentStep === 1 && !canProceedStep1) ||
              (currentStep === 2 && !canProceedStep2) ||
              (currentStep === 3 && !canProceedStep3)
            }
            className="flex items-center gap-2 px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80 disabled:opacity-50"
          >
            Weiter
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={isSaving || !canProceedStep1}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isSaving ? (
              <>Speichern...</>
            ) : (
              <>
                <Check size={16} />
                {isEditing ? 'Speichern' : 'Erstellen'}
              </>
            )}
          </button>
        )}
      </div>

      {/* New Location Modal */}
      {showNewLocationForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-krt-dark rounded-lg border border-gray-700 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={24} className="text-krt-orange" />
                Neuen Treffpunkt erstellen
              </h2>
              <button
                onClick={() => {
                  setShowNewLocationForm(false)
                  setNewLocationName('')
                  setNewLocationSystem('')
                }}
                className="text-gray-400 hover:text-primary"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="z.B. Orbituary, GrimHEX, Port Olisar..."
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">System</label>
                <select
                  value={newLocationSystem}
                  onChange={(e) => setNewLocationSystem(e.target.value)}
                  className="w-full bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value="">-- System wählen --</option>
                  <option value="Stanton">Stanton</option>
                  <option value="Pyro">Pyro</option>
                  <option value="Nyx">Nyx</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewLocationForm(false)
                  setNewLocationName('')
                  setNewLocationSystem('')
                }}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (newLocationName.trim()) {
                    createLocationMutation.mutate({
                      name: newLocationName.trim(),
                      system_name: newLocationSystem || undefined,
                    })
                  }
                }}
                disabled={!newLocationName.trim() || createLocationMutation.isPending}
                className="px-4 py-2 bg-krt-orange rounded hover:bg-krt-orange/80 disabled:opacity-50"
              >
                {createLocationMutation.isPending ? 'Erstellen...' : 'Ort erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-krt-dark rounded-lg border border-red-600/50 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-600/20 rounded-full">
                <Trash2 size={24} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-red-400">Einsatz löschen</h2>
            </div>

            <p className="text-gray-300 mb-2">
              Möchtest du diesen Einsatz wirklich löschen?
            </p>
            <p className="text-gray-400 text-sm mb-6">
              <strong className="text-white">{missionData.title || 'Unbenannter Einsatz'}</strong>
              <br />
              Diese Aktion kann nicht rückgängig gemacht werden. Alle Einheiten, Positionen, Phasen und Anmeldungen werden ebenfalls gelöscht.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Abbrechen
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Löschen...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
