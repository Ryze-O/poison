import { useSearchParams, Link } from 'react-router-dom'

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason')

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Zugriff verweigert</h1>

        {reason === 'not_member' && (
          <>
            <p className="text-gray-300 mb-4">
              Du bist kein Mitglied des Kartell Discord-Servers.
            </p>
            <p className="text-gray-400 text-sm">
              Bitte tritt zuerst dem Discord-Server bei und versuche es erneut.
            </p>
          </>
        )}

        {!reason && (
          <p className="text-gray-300 mb-4">
            Ein unbekannter Fehler ist aufgetreten.
          </p>
        )}

        <Link to="/login" className="btn btn-primary mt-6 inline-block">
          Erneut versuchen
        </Link>
      </div>
    </div>
  )
}
