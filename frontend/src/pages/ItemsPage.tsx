import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Trash2, Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { Component } from '../api/types'

// Item ist ein Alias für Component (DB-Tabelle bleibt components)
type Item = Component

export default function ItemsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSubCategory, setFilterSubCategory] = useState<string>('')
  const [filterManufacturer, setFilterManufacturer] = useState<string>('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    sub_category: '',
  })

  const canCreate = user?.role === 'officer' || user?.role === 'treasurer' || user?.role === 'admin'
  const canDelete = user?.role === 'admin'

  const { data: items } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => apiClient.get('/api/items').then((r) => r.data),
  })

  const { data: categories } = useQuery<string[]>({
    queryKey: ['items', 'categories'],
    queryFn: () => apiClient.get('/api/items/categories').then((r) => r.data),
  })

  const { data: subCategories } = useQuery<string[]>({
    queryKey: ['items', 'sub-categories', filterCategory],
    queryFn: () => {
      const params = filterCategory ? `?category=${encodeURIComponent(filterCategory)}` : ''
      return apiClient.get(`/api/items/sub-categories${params}`).then((r) => r.data)
    },
  })

  const { data: manufacturers } = useQuery<string[]>({
    queryKey: ['items', 'manufacturers'],
    queryFn: () => apiClient.get('/api/items/manufacturers').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; sub_category?: string }) =>
      apiClient.post('/api/items', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      setShowForm(false)
      setFormData({ name: '', category: '', sub_category: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      name: formData.name,
      category: formData.category || undefined,
      sub_category: formData.sub_category || undefined,
    })
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Filtern
  const filteredItems = items?.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.manufacturer?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !filterCategory || item.category === filterCategory
    const matchesSubCategory = !filterSubCategory || item.sub_category === filterSubCategory
    const matchesManufacturer = !filterManufacturer || item.manufacturer === filterManufacturer
    return matchesSearch && matchesCategory && matchesSubCategory && matchesManufacturer
  })

  // Zweistufige Gruppierung: Category → Sub-Category → Items
  const groupedItems = filteredItems?.reduce(
    (acc, item) => {
      const cat = item.category || 'Ohne Kategorie'
      const subCat = item.sub_category || 'Allgemein'
      if (!acc[cat]) acc[cat] = {}
      if (!acc[cat][subCat]) acc[cat][subCat] = []
      acc[cat][subCat].push(item)
      return acc
    },
    {} as Record<string, Record<string, Item[]>>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Items</h1>
        {canCreate && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Neues Item
          </button>
        )}
      </div>

      {/* Neues Item erstellen */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Neues Item anlegen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="z.B. FR-76 Schild, Quantainium (rein)"
                className="input"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Kategorie</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="z.B. Ship Components, Erze"
                  className="input"
                  list="categories"
                />
                <datalist id="categories">
                  {categories?.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="label">Unterkategorie</label>
                <input
                  type="text"
                  value={formData.sub_category}
                  onChange={(e) =>
                    setFormData({ ...formData, sub_category: e.target.value })
                  }
                  placeholder="z.B. Shields, Quantainium"
                  className="input"
                  list="sub-categories"
                />
                <datalist id="sub-categories">
                  {subCategories?.map((sub) => (
                    <option key={sub} value={sub} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn btn-primary flex-1"
              >
                {createMutation.isPending ? 'Wird gespeichert...' : 'Anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Such- und Filterleiste */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item oder Hersteller suchen..."
              className="input pl-10"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value)
              setFilterSubCategory('') // Reset sub-category wenn Kategorie wechselt
            }}
            className="input md:w-48"
          >
            <option value="">Alle Kategorien</option>
            {categories?.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={filterSubCategory}
            onChange={(e) => setFilterSubCategory(e.target.value)}
            className="input md:w-48"
          >
            <option value="">Alle Unterkategorien</option>
            {subCategories?.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          <select
            value={filterManufacturer}
            onChange={(e) => setFilterManufacturer(e.target.value)}
            className="input md:w-48"
          >
            <option value="">Alle Hersteller</option>
            {manufacturers?.map((manu) => (
              <option key={manu} value={manu}>
                {manu}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-sm text-gray-400">
          {filteredItems?.length || 0} Items gefunden
        </p>
      </div>

      {/* Items-Liste mit zweistufiger Gruppierung */}
      {groupedItems && Object.keys(groupedItems).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, subCategories]) => {
              const isExpanded = expandedCategories.has(category)
              const totalItems = Object.values(subCategories).flat().length

              return (
                <div key={category} className="card">
                  {/* Kategorie-Header (klickbar) */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between text-left focus:outline-none"
                  >
                    <h3 className="text-lg font-bold text-krt-orange flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      {category}
                    </h3>
                    <span className="text-sm text-gray-400">{totalItems} Items</span>
                  </button>

                  {/* Unterkategorien (ausklappbar) */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      {Object.entries(subCategories)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([subCategory, items]) => (
                          <div key={subCategory}>
                            <h4 className="text-sm font-medium text-gray-300 mb-2 border-b border-gray-700 pb-1">
                              {subCategory} ({items.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {items.map((item) => (
                                <div
                                  key={item.id}
                                  className="element p-3 flex items-center justify-between"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{item.name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                      {[
                                        item.manufacturer,
                                        item.size && `Size ${item.size}`,
                                        item.grade && `Grade ${item.grade}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' • ') || (item.is_predefined ? 'SC-Daten' : '')}
                                    </p>
                                  </div>
                                  {canDelete && !item.is_predefined && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (confirm(`"${item.name}" wirklich löschen?`)) {
                                          deleteMutation.mutate(item.id)
                                        }
                                      }}
                                      className="p-2 text-gray-400 hover:text-sc-red rounded-lg flex-shrink-0"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400">
            {search || filterCategory || filterSubCategory || filterManufacturer
              ? 'Keine Items gefunden.'
              : 'Noch keine Items vorhanden.'}
          </p>
        </div>
      )}
    </div>
  )
}
