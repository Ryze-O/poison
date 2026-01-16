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
      setToken(token)
      fetchUser().then(() => {
        navigate('/')
      })
    } else {
      navigate('/login')
    }
  }, [searchParams, setToken, fetchUser, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sc-blue">Anmeldung wird verarbeitet...</div>
    </div>
  )
}
