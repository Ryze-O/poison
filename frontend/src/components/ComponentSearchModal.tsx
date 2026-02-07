import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { Search, X } from 'lucide-react'
import type { Component } from '../api/types'

interface ComponentSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (component: Component) => void
  filterSize?: number | null
  filterSubCategory?: string | null
  title?: string
}

export default function ComponentSearchModal({
  isOpen,
  onClose,
  onSelect,
  filterSize,
  filterSubCategory,
  title = 'Komponente suchen',
}: ComponentSearchModalProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setDebouncedSearch('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: results, isLoading } = useQuery<Component[]>({
    queryKey: ['component-search', debouncedSearch, filterSize, filterSubCategory],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterSize) params.set('size', String(filterSize))
      if (filterSubCategory) params.set('sub_category', filterSubCategory)
      params.set('limit', '20')
      const res = await apiClient.get(`/api/items?${params}`)
      return res.data
    },
    enabled: isOpen && debouncedSearch.length >= 2,
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Komponenten-Name eingeben..."
            className="input pl-10"
          />
        </div>

        {filterSize && (
          <p className="text-xs text-gray-500 mb-2">Filter: Size {filterSize}</p>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px]">
          {isLoading && debouncedSearch.length >= 2 && (
            <p className="text-gray-400 text-sm p-3">Suche...</p>
          )}
          {debouncedSearch.length < 2 && (
            <p className="text-gray-500 text-sm p-3">Mindestens 2 Zeichen eingeben...</p>
          )}
          {results?.length === 0 && (
            <p className="text-gray-400 text-sm p-3">Keine Ergebnisse</p>
          )}
          {results?.map((comp) => (
            <button
              key={comp.id}
              onClick={() => {
                onSelect(comp)
                onClose()
              }}
              className="w-full text-left p-3 rounded-lg hover:bg-gray-700/50 transition-colors flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-sm">{comp.name}</p>
                <p className="text-xs text-gray-500">
                  {comp.manufacturer && `${comp.manufacturer} · `}
                  {comp.sub_category && `${comp.sub_category} · `}
                  {comp.size && `Size ${comp.size} · `}
                  {comp.grade && `Grade ${comp.grade} · `}
                  {comp.item_class && comp.item_class}
                </p>
              </div>
              {comp.size && (
                <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
                  S{comp.size}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
