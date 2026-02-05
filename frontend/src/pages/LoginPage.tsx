import { useAuthStore } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { AlertCircle, CheckCircle, User, Lock, UserPlus } from 'lucide-react'

type TabType = 'discord' | 'password' | 'register'

export default function LoginPage() {
  const { login, isAuthenticated, setToken, fetchUser } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('discord')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await apiClient.post('/api/auth/login/password', {
        username,
        password,
      })

      // Token speichern und User abrufen
      const { access_token } = response.data
      setToken(access_token)
      await fetchUser()
      navigate('/')
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      setError(axiosError.response?.data?.detail || 'Anmeldung fehlgeschlagen')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein')
      return
    }

    setIsLoading(true)

    try {
      await apiClient.post('/api/auth/register', {
        username,
        password,
        display_name: displayName || undefined,
      })

      setSuccess('Registrierung erfolgreich! Ein Admin wird deinen Account freischalten.')
      setUsername('')
      setPassword('')
      setConfirmPassword('')
      setDisplayName('')
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      setError(axiosError.response?.data?.detail || 'Registrierung fehlgeschlagen')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Kartell Logo als subtiler Hintergrund */}
      <div
        className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none"
        aria-hidden="true"
      >
        <img
          src="/assets/krt_logo.svg"
          alt=""
          className="w-[800px] h-[800px] object-contain"
          style={{ filter: 'brightness(0)' }}
        />
      </div>

      <div className="card max-w-md w-full mx-4 text-center relative overflow-hidden">
        {/* Orange Akzent-Linie oben */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-krt-orange to-transparent" />

        {/* Logo */}
        <img
          src="/assets/Staffel-Viper-RWK 2019-750px.png"
          alt="Staffel Viper"
          className="w-24 h-24 mx-auto mb-4 object-contain"
        />

        <h1 className="text-3xl font-bold text-white mb-1 tracking-wide">STAFFEL VIPER</h1>
        <p className="text-krt-orange text-sm tracking-widest mb-2">DAS KARTELL</p>
        <p className="text-gray-400 mb-6 text-sm">Staffel-Verwaltung für Star Citizen</p>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6">
          <button
            onClick={() => { setActiveTab('discord'); setError(null); setSuccess(null) }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'discord'
                ? 'text-[#5865F2] border-b-2 border-[#5865F2]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Discord
          </button>
          <button
            onClick={() => { setActiveTab('password'); setError(null); setSuccess(null) }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'password'
                ? 'text-krt-orange border-b-2 border-krt-orange'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Passwort
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError(null); setSuccess(null) }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'register'
                ? 'text-green-500 border-b-2 border-green-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Registrieren
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg text-red-400 flex items-center gap-2 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-600/50 rounded-lg text-green-400 flex items-center gap-2 text-sm">
            <CheckCircle size={18} />
            {success}
          </div>
        )}

        {/* Discord Tab */}
        {activeTab === 'discord' && (
          <div>
            <button
              onClick={login}
              className="btn bg-[#5865F2] hover:bg-[#4752C4] text-white w-full flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Mit Discord anmelden
            </button>
            <p className="mt-4 text-sm text-gray-500">
              Empfohlen für Staffel-Mitglieder
            </p>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordLogin} className="text-left">
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Benutzername</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="Dein Benutzername"
                  required
                />
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
            </button>
            <p className="mt-4 text-sm text-gray-500 text-center">
              Kein Account?{' '}
              <button
                type="button"
                onClick={() => setActiveTab('register')}
                className="text-krt-orange hover:underline"
              >
                Jetzt registrieren
              </button>
            </p>
          </form>
        )}

        {/* Register Tab */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="text-left">
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Benutzername *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="Wähle einen Benutzernamen"
                  required
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Anzeigename (optional)</label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="Dein Name in der Staffel"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Passwort *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="Mindestens 6 Zeichen"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1">Passwort bestätigen *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full pl-10"
                  placeholder="Passwort wiederholen"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn bg-green-600 hover:bg-green-700 text-white w-full"
            >
              {isLoading ? 'Wird registriert...' : 'Registrieren'}
            </button>
            <p className="mt-4 text-sm text-gray-500 text-center">
              Nach der Registrierung muss ein Admin deinen Account freischalten.
            </p>
          </form>
        )}

        {/* Orange Akzent-Linie unten */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-krt-orange to-transparent" />
      </div>
    </div>
  )
}
