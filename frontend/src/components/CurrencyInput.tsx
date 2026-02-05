import { useState, useEffect, useRef } from 'react'

interface CurrencyInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
  min?: number
  disabled?: boolean
}

/**
 * Formatiert eine Zahl mit deutschen Tausendertrennzeichen (Punkte).
 * z.B. 1000000 -> "1.000.000"
 */
export function formatCurrency(value: number | string): string {
  // Konvertiere zu Zahl und entferne ungültige Zeichen
  const numStr = String(value).replace(/[^\d]/g, '')
  if (!numStr) return ''

  const num = parseInt(numStr, 10)
  if (isNaN(num)) return ''

  // Formatiere mit Punkten als Tausendertrennzeichen
  return num.toLocaleString('de-DE')
}

/**
 * Entfernt Formatierung und gibt die reine Zahl zurück.
 * z.B. "1.000.000" -> "1000000"
 */
export function parseCurrency(formatted: string): string {
  return formatted.replace(/\./g, '').replace(/,/g, '.')
}

/**
 * Formatiert eine Zahl für die Anzeige mit "aUEC" Suffix.
 * z.B. 1000000 -> "1.000.000 aUEC"
 */
export function formatCurrencyDisplay(value: number): string {
  return `${value.toLocaleString('de-DE')} aUEC`
}

export default function CurrencyInput({
  value,
  onChange,
  placeholder = 'z.B. 5.000.000',
  className = '',
  required = false,
  min,
  disabled = false,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorPosRef = useRef<number>(0)

  // Formatiere den initialen Wert
  useEffect(() => {
    if (value) {
      setDisplayValue(formatCurrency(value))
    } else {
      setDisplayValue('')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const rawValue = input.value

    // Erlaube nur Ziffern und Punkte
    const cleanedValue = rawValue.replace(/[^\d.]/g, '')

    // Entferne alle Punkte für die reine Zahl
    const numericValue = cleanedValue.replace(/\./g, '')

    if (numericValue === '') {
      setDisplayValue('')
      onChange('')
      return
    }

    // Formatiere mit Tausendertrennzeichen
    const formatted = formatCurrency(numericValue)

    // Berechne neue Cursor-Position
    // Zähle wie viele Punkte vor der alten Position waren vs. neue
    const oldDots = (displayValue.slice(0, cursorPosRef.current).match(/\./g) || []).length
    const newDotsBeforeCursor = (formatted.slice(0, cursorPosRef.current).match(/\./g) || []).length

    setDisplayValue(formatted)
    onChange(numericValue) // Speichere die reine Zahl

    // Cursor-Position anpassen nach dem Rendern
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const diff = newDotsBeforeCursor - oldDots
        let newPos = cursorPosRef.current + diff

        // Wenn wir am Ende tippen, gehe ans Ende
        if (cursorPosRef.current >= displayValue.length) {
          newPos = formatted.length
        }

        inputRef.current.setSelectionRange(newPos, newPos)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Speichere Cursor-Position vor der Änderung
    cursorPosRef.current = (e.target as HTMLInputElement).selectionStart || 0
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')

    // Entferne alle Nicht-Ziffern (außer Komma für Dezimalzahlen)
    const cleaned = pastedText.replace(/[^\d,]/g, '').replace(',', '.')
    const numericValue = cleaned.split('.')[0] // Nur ganzzahligen Teil nehmen

    if (numericValue) {
      const formatted = formatCurrency(numericValue)
      setDisplayValue(formatted)
      onChange(numericValue)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        className={`input ${className}`}
        required={required}
        disabled={disabled}
        min={min}
      />
      {displayValue && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
          aUEC
        </span>
      )}
    </div>
  )
}
