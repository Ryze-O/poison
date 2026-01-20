import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function GuestLoginPage() {
  const { token } = useParams<{ token: string }>()

  useEffect(() => {
    if (token) {
      // Redirect zum Backend für Gäste-Login
      window.location.href = `${API_URL}/api/auth/guest/${token}`
    }
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-krt-dark to-krt-darkest">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-krt-orange mx-auto mb-4" />
        <p className="text-gray-400">Gäste-Login wird verarbeitet...</p>
      </div>
    </div>
  )
}
