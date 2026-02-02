import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './hooks/useAuth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import AuthErrorPage from './pages/AuthErrorPage'
import GuestPendingPage from './pages/GuestPendingPage'
import DashboardPage from './pages/DashboardPage'
import AttendancePage from './pages/AttendancePage'
import LootPage from './pages/LootPage'
import InventoryPage from './pages/InventoryPage'
import ItemsPage from './pages/ItemsPage'
import ComponentBrowserPage from './pages/ComponentBrowserPage'
import LocationsPage from './pages/LocationsPage'
import TreasuryPage from './pages/TreasuryPage'
import UsersPage from './pages/UsersPage'
import AdminPage from './pages/AdminPage'
import GuestLoginPage from './pages/GuestLoginPage'
import StaffelstrukturPage from './pages/StaffelstrukturPage'
import AssignmentMatrixPage from './pages/AssignmentMatrixPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-krt-orange">Laden...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Guest-User sehen nur die Warte-Seite
  if (user?.role === 'guest') {
    return <GuestPendingPage />
  }

  return <>{children}</>
}

// Route nur für Offiziere und höher (Datenbank-Seiten)
function OfficerRoute({ children }: { children: React.ReactNode }) {
  const effectiveRole = useAuthStore.getState().getEffectiveRole()
  const isOfficerOrHigher = effectiveRole === 'officer' || effectiveRole === 'treasurer' || effectiveRole === 'admin'

  if (!isOfficerOrHigher) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/success" element={<AuthCallback />} />
      <Route path="/auth/error" element={<AuthErrorPage />} />
      <Route path="/guest/:token" element={<GuestLoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="struktur" element={<StaffelstrukturPage />} />
        <Route path="struktur/matrix" element={<AssignmentMatrixPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="loot" element={<LootPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="treasury" element={<TreasuryPage />} />
        <Route path="components" element={<ComponentBrowserPage />} />
        {/* Datenbank-Seiten (nur Offiziere+) */}
        <Route path="items" element={<OfficerRoute><ItemsPage /></OfficerRoute>} />
        <Route path="locations" element={<OfficerRoute><LocationsPage /></OfficerRoute>} />
        <Route path="users" element={<OfficerRoute><UsersPage /></OfficerRoute>} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}

export default App
