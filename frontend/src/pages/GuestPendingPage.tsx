import { useAuthStore } from '../hooks/useAuth'

export default function GuestPendingPage() {
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <h1 className="text-2xl font-bold text-krt-orange mb-4">
          Willkommen, {user?.display_name || user?.username}!
        </h1>

        <p className="text-gray-300 mb-4">
          Dein Account wurde erstellt, aber du hast noch keinen Zugriff auf POISON.
        </p>

        <p className="text-gray-400 text-sm mb-6">
          Ein Admin muss dich erst als VPR-Mitglied freischalten.
          Melde dich bei einem Offizier im Discord.
        </p>

        <button onClick={logout} className="btn btn-secondary">
          Ausloggen
        </button>
      </div>
    </div>
  )
}
