import { create } from 'zustand'
import { apiClient } from '../api/client'
import type { User, UserRole } from '../api/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  // Vorschaumodus: temporär als andere Rolle agieren
  previewRole: UserRole | null
  login: () => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  setToken: (token: string) => void
  // Vorschaumodus aktivieren/deaktivieren
  setPreviewRole: (role: UserRole | null) => void
  // Effektive Rolle (Vorschau oder echte Rolle)
  getEffectiveRole: () => UserRole | undefined
  // Prüft ob User mindestens Offizier ist (für Vorschau-Berechtigung)
  canUsePreviewMode: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: true,
  previewRole: null,

  login: async () => {
    const response = await apiClient.get('/api/auth/login')
    window.location.href = response.data.url
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, isAuthenticated: false, previewRole: null })
    window.location.href = '/login'
  },

  setToken: (token: string) => {
    localStorage.setItem('token', token)
    set({ isAuthenticated: true })
  },

  fetchUser: async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }

    try {
      const response = await apiClient.get('/api/users/me')
      set({ user: response.data, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem('token')
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  setPreviewRole: (role: UserRole | null) => {
    set({ previewRole: role })
  },

  getEffectiveRole: () => {
    const { user, previewRole } = get()
    if (!user) return undefined
    return previewRole || user.role
  },

  canUsePreviewMode: () => {
    const { user } = get()
    if (!user) return false
    // Offiziere, Kassenwartin, Admins können Vorschaumodus nutzen
    return ['officer', 'treasurer', 'admin'].includes(user.role)
  },
}))

// Beim App-Start Benutzer laden
if (typeof window !== 'undefined') {
  useAuthStore.getState().fetchUser()
}
