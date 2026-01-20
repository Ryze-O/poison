import { create } from 'zustand'
import { apiClient } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  setToken: (token: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: true,

  login: async () => {
    const response = await apiClient.get('/auth/login')
    window.location.href = response.data.url
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, isAuthenticated: false })
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
}))

// Beim App-Start Benutzer laden
if (typeof window !== 'undefined') {
  useAuthStore.getState().fetchUser()
}
