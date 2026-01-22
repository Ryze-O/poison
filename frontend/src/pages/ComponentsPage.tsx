import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { useAuthStore } from '../hooks/useAuth'
import { Plus, Trash2, Search } from 'lucide-react'
import type { Component } from '../api/types'

export default function ComponentsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterManufacturer, setFilterManufacturer] = useState<string>('')
  const [formData, setFormData] = useState({
    name: '',
    category: '',
  })

  // Effektive Rolle (berücksichtigt Vorschaumodus)
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const canCreate = effectiveRole === 'officer' || effectiveRole === 'treasurer' || effectiveRole === 'admin'
  const canDelete = effectiveRole === 'admin'

  const { data: components } = useQuery<Component[]>({
    queryKey: ['components'],
    queryFn: () => apiClient.get('/api/components').then((r) => r.data),
  })

  const { data: categories } = useQuery<string[]>({
    queryKey: ['components', 'categories'],
    queryFn: () => apiClient.get('/api/components/categories').then((r) => r.data),
  })

  const { data: manufacturers } = useQuery<string[]>({
    queryKey: ['components', 'manufacturers'],
    queryFn: () => apiClient.get('/api/components/manufacturers').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string }) =>
      apiClient.post('/api/components', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] })
      setShowForm(false)
      setFormData({ name: '', category: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/components/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      name: formData.name,
      category: formData.category || undefined,
    })
  }

  // Filtern
  const filteredComponents = components?.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.manufacturer?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !filterCategory || c.category === filterCategory
    const matchesManufacturer = !filterManufacturer || c.manufacturer === filterManufacturer
    return matchesSearch && matchesCategory && matchesManufacturer
  })

  // Nach Kategorie gruppieren
  const groupedComponents = filteredComponents?.reduce(
    (acc, comp) => {
      const cat = comp.category || 'Ohne Kategorie'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(comp)
      return acc
    },
    {} as Record<string, Component[]>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Komponenten</h1>
        {canCreate && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Neue Komponente
          </button>
        )}
      </div>

      {/* Neue Komponente erstellen */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold mb-4">Neue Komponente anlegen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="z.B. FR-76 Schild"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Kategorie</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="z.B. Schilde, Waffen, Kühler"
                className="input"
                list="categories"
              />
              <datalist id="categories">
                {categories?.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
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
              placeholder="Komponente oder Hersteller suchen..."
              className="input pl-10"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
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
        {(filterCategory || filterManufacturer) && (
          <p className="mt-3 text-sm text-gray-400">
            {filteredComponents?.length || 0} Komponenten gefunden
          </p>
        )}
      </div>

      {/* Komponenten-Liste */}
      {groupedComponents && Object.keys(groupedComponents).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedComponents)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, comps]) => (
              <div key={category} className="card">
                <h3 className="text-lg font-bold mb-4 text-krt-orange">
                  {category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comps.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{comp.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {[
                            comp.manufacturer,
                            comp.size && `Size ${comp.size}`,
                            comp.grade && `Grade ${comp.grade}`,
                          ]
                            .filter(Boolean)
                            .join(' • ') || (comp.is_predefined ? 'Vordefiniert' : '')}
                        </p>
                      </div>
                      {canDelete && !comp.is_predefined && (
                        <button
                          onClick={() => {
                            if (confirm(`"${comp.name}" wirklich löschen?`)) {
                              deleteMutation.mutate(comp.id)
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
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400">
            {search || filterCategory || filterManufacturer
              ? 'Keine Komponenten gefunden.'
              : 'Noch keine Komponenten vorhanden.'}
          </p>
        </div>
      )}
    </div>
  )
}
