import type { Location } from '../api/types'

interface GroupedLocationSelectProps {
  locations: Location[]
  value: number | null
  onChange: (locationId: number | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Gruppierte Standort-Auswahl.
 * Gruppiert nach System (Stanton, Pyro, Nyx) und Planet/Bereich,
 * alphabetisch sortiert innerhalb der Gruppen.
 */
export default function GroupedLocationSelect({
  locations,
  value,
  onChange,
  placeholder = 'Standort wählen...',
  className = '',
  disabled = false,
}: GroupedLocationSelectProps) {
  // Gruppiere Locations nach System und Planet
  const grouped = groupLocations(locations)

  // Sortierte Liste von Locations für ein System erstellen
  const getSystemOptions = (system: string) => {
    const systemGroup = grouped[system]
    if (!systemGroup) return []

    const options: { id: number; label: string; sortKey: string }[] = []

    // Sortiere Planeten: echte Namen zuerst (alphabetisch), dann _none
    const planets = Object.keys(systemGroup).sort((a, b) => {
      if (a === '_none') return 1
      if (b === '_none') return -1
      return a.localeCompare(b, 'de')
    })

    for (const planet of planets) {
      const planetLocations = systemGroup[planet]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))

      for (const loc of planetLocations) {
        if (planet === '_none') {
          options.push({
            id: loc.id,
            label: loc.name,
            sortKey: loc.name,
          })
        } else {
          options.push({
            id: loc.id,
            label: `${planet} › ${loc.name}`,
            sortKey: `${planet} ${loc.name}`,
          })
        }
      }
    }

    return options
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={`bg-krt-dark border border-gray-600 rounded px-3 py-2 text-white ${className}`}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>

      {/* Stanton zuerst (Hauptsystem), dann Pyro, dann Nyx */}
      {['Stanton', 'Pyro', 'Nyx'].map((system) => {
        const options = getSystemOptions(system)
        if (options.length === 0) return null

        return (
          <optgroup key={system} label={`━━ ${system} ━━`}>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        )
      })}

      {/* Unbekannte Systeme / Ohne System */}
      {grouped['_other'] && Object.keys(grouped['_other']).length > 0 && (
        <optgroup label="━━ Sonstige ━━">
          {Object.values(grouped['_other'])
            .flat()
            .sort((a, b) => a.name.localeCompare(b.name, 'de'))
            .map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  )
}

/**
 * Gruppiert Locations nach System und Planet.
 */
function groupLocations(
  locations: Location[]
): Record<string, Record<string, Location[]>> {
  const grouped: Record<string, Record<string, Location[]>> = {}

  for (const loc of locations) {
    const system = loc.system_name || '_other'
    const planet = loc.planet_name || '_none'

    if (!grouped[system]) {
      grouped[system] = {}
    }
    if (!grouped[system][planet]) {
      grouped[system][planet] = []
    }
    grouped[system][planet].push(loc)
  }

  return grouped
}
