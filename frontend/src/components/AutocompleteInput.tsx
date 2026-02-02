import { useState, useRef, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'

export interface AutocompleteSuggestion {
  id: string | number
  label: string
  sublabel?: string
}

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (suggestion: AutocompleteSuggestion) => void
  suggestions: AutocompleteSuggestion[]
  isLoading?: boolean
  placeholder?: string
  minChars?: number
  className?: string
  autoFocus?: boolean
  showIcon?: boolean
}

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions,
  isLoading = false,
  placeholder = 'Suchen...',
  minChars = 2,
  className = '',
  autoFocus = false,
  showIcon = true,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Suggestions anzeigen wenn Eingabe >= minChars und Suggestions vorhanden
  const showSuggestions = value.length >= minChars && (suggestions.length > 0 || isLoading)

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [suggestions])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || !isOpen) {
      if (e.key === 'ArrowDown' && showSuggestions) {
        setIsOpen(true)
        setHighlightedIndex(0)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }, [showSuggestions, isOpen, suggestions, highlightedIndex])

  const handleSelect = (suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.label)
    setIsOpen(false)
    setHighlightedIndex(-1)
    onSelect?.(suggestion)
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  const handleFocus = () => {
    if (value.length >= minChars && suggestions.length > 0) {
      setIsOpen(true)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {showIcon && (
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
          size={20}
        />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={`input w-full ${showIcon ? 'pl-10' : ''}`}
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-krt-orange border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Suggestions dropdown */}
      {isOpen && showSuggestions && !isLoading && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-4 py-2 cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-krt-orange/20 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div className="font-medium">{suggestion.label}</div>
              {suggestion.sublabel && (
                <div className="text-xs text-gray-500">{suggestion.sublabel}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
