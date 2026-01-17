import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../hooks/useAuth'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setToken, fetchUser } = useAuthStore()

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      // Token direkt im localStorage setzen und dann im Store
      localStorage.setItem('token', token)
      setToken(token)
      // Kurze Verzögerung um sicherzustellen, dass der Token verfügbar ist
      setTimeout(() => {
        fetchUser().then(() => {
          navigate('/')
        }).catch(() => {
          navigate('/login')
        })
      }, 100)
    } else {
      navigate('/login')
    }
  }, [searchParams, setToken, fetchUser, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-krt-orange">Anmeldung wird verarbeitet...</div>
    </div>
  )
}
