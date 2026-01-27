import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Trash2, Search, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { Component } from '../api/types'

// Item ist ein Alias für Component (DB-Tabelle bleibt components)
type Item = Component

export default function ItemsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSubCategory, setFilterSubCategory] = useState<string>('')
  const [filterManufacturer, setFilterManufacturer] = useState<string>('')
  const [filterItemClass, setFilterItemClass] = useState<string>('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    sub_category: '',
  })

  // Effektive Rolle (berücksichtigt Vorschaumodus)
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const canCreate = effectiveRole === 'officer' || effectiveRole === 'treasurer' || effectiveRole === 'admin'
  const canDelete = effectiveRole === 'admin'

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
    const searchLower = search.toLowerCase()
    const matchesSearch = item.name.toLowerCase().includes(searchLower) ||
      item.manufacturer?.toLowerCase().includes(searchLower) ||
      item.class_name?.toLowerCase().includes(searchLower)
    const matchesCategory = !filterCategory || item.category === filterCategory
    const matchesSubCategory = !filterSubCategory || item.sub_category === filterSubCategory
    const matchesManufacturer = !filterManufacturer || item.manufacturer === filterManufacturer
    const matchesItemClass = !filterItemClass || item.item_class === filterItemClass
    return matchesSearch && matchesCategory && matchesSubCategory && matchesManufacturer && matchesItemClass
  })

  // Item-Klassen extrahieren
  const itemClasses = [...new Set(items?.map(i => i.item_class).filter((c): c is string => c !== null) || [])].sort()

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
              placeholder="Name, Hersteller oder Ref-Code suchen..."
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
          <select
            value={filterItemClass}
            onChange={(e) => setFilterItemClass(e.target.value)}
            className="input md:w-40"
          >
            <option value="">Alle Klassen</option>
            {itemClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
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
                                  onClick={() => navigate(`/components?search=${encodeURIComponent(item.name)}`)}
                                  className="element p-3 cursor-pointer hover:border-krt-orange/30 group"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="font-medium truncate group-hover:text-krt-orange transition-colors flex-1">
                                      {item.name}
                                    </p>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <ExternalLink size={14} className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      {canDelete && !item.is_predefined && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (confirm(`"${item.name}" wirklich löschen?`)) {
                                              deleteMutation.mutate(item.id)
                                            }
                                          }}
                                          className="p-2 text-gray-400 hover:text-sc-red rounded-lg"
                                        >
                                          <Trash2 size={18} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {/* Basis-Info */}
                                  <p className="text-xs text-krt-orange dark:text-krt-orange/70 truncate">
                                    {[
                                      item.manufacturer,
                                      item.size && `Size ${item.size}`,
                                      item.grade && `Grade ${item.grade}`,
                                      item.item_class,
                                    ]
                                      .filter(Boolean)
                                      .join(' • ') || (item.is_predefined ? 'SC-Daten' : '')}
                                  </p>
                                  {/* Ref-Code */}
                                  {item.class_name && (
                                    <p className="text-xs text-gray-500 font-mono mt-1 truncate">
                                      {item.class_name}
                                    </p>
                                  )}
                                  {/* Technische Stats */}
                                  <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
                                    {item.power_draw && <span>Power: {item.power_draw.toFixed(0)}</span>}
                                    {item.durability && <span>HP: {item.durability.toFixed(0)}</span>}
                                    {item.cooling_rate && <span>Cool: {item.cooling_rate.toFixed(0)}/s</span>}
                                    {item.shield_hp && <span>Shield: {item.shield_hp.toFixed(0)}</span>}
                                    {item.shield_regen && <span>Regen: {item.shield_regen.toFixed(0)}/s</span>}
                                    {item.power_output && <span>Output: {item.power_output.toFixed(0)}</span>}
                                    {item.quantum_speed && <span>QT: {(item.quantum_speed / 1000000).toFixed(1)}M m/s</span>}
                                  </div>
                                  {/* Shop-Info */}
                                  {item.shop_locations && (
                                    <p className="text-xs text-green-400 mt-1 truncate">
                                      Kaufbar: {item.shop_locations}
                                    </p>
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
            {search || filterCategory || filterSubCategory || filterManufacturer || filterItemClass
              ? 'Keine Items gefunden.'
              : 'Noch keine Items vorhanden.'}
          </p>
        </div>
      )}
    </div>
  )
}
