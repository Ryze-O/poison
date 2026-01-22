import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import {
  Home,
  Users,
  Package,
  Wallet,
  ClipboardList,
  Gift,
  LogOut,
  Menu,
  X,
  Boxes,
  MapPin,
  Settings,
  Search,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Database,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

// Haupt-Navigation (für alle sichtbar)
const mainNavItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/attendance', icon: ClipboardList, label: 'Staffelabende' },
  { to: '/loot', icon: Gift, label: 'Freeplay (Loot)' },
  { to: '/inventory', icon: Package, label: 'Lager' },
  { to: '/treasury', icon: Wallet, label: 'Kasse' },
  { to: '/components', icon: Search, label: 'Item Search' },
]

// Datenbank-Navigation (nur für Offiziere+)
const databaseNavItems = [
  { to: '/items', icon: Boxes, label: 'Items' },
  { to: '/locations', icon: MapPin, label: 'Standorte' },
  { to: '/users', icon: Users, label: 'Benutzer' },
]

// Admin-Navigation
const adminNavItems = [
  { to: '/admin', icon: Settings, label: 'Admin' },
]

export default function Layout() {
  const { user, logout, previewRole, setPreviewRole, canUsePreviewMode } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [databaseExpanded, setDatabaseExpanded] = useState(false)

  const isInPreviewMode = previewRole !== null
  const effectiveRole = previewRole || user?.role
  const isOfficerOrHigher = effectiveRole === 'officer' || effectiveRole === 'treasurer' || effectiveRole === 'admin'
  const isAdmin = !isInPreviewMode && user?.role === 'admin'

  return (
    <div className="min-h-screen flex bg-page text-primary">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg border border-default"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-default transform transition-transform duration-200 shadow-lg',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-default">
            <div className="flex items-center gap-3">
              <img
                src="/assets/Staffel-Viper-RWK 2019-750px.png"
                alt="Staffel Viper"
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-xl font-bold tracking-wide">STAFFEL VIPER</h1>
                <p className="text-xs text-krt-orange tracking-widest">DAS KARTELL</p>
              </div>
            </div>
            {/* Orange Akzent-Linie */}
            <div className="mt-4 h-px bg-gradient-to-r from-krt-orange via-krt-orange to-transparent" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {/* Haupt-Navigation */}
            {mainNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-krt-orange/20 text-krt-orange border-l-2 border-krt-orange'
                      : 'text-muted hover:bg-card-hover hover:text-primary'
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}

            {/* Datenbank-Kategorie (nur für Offiziere+) */}
            {isOfficerOrHigher && (
              <>
                <button
                  onClick={() => setDatabaseExpanded(!databaseExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-muted hover:bg-card-hover hover:text-primary transition-all duration-200 mt-4"
                >
                  <div className="flex items-center gap-3">
                    <Database size={20} />
                    <span>Datenbank</span>
                  </div>
                  {databaseExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {databaseExpanded && (
                  <div className="ml-4 space-y-1 border-l border-gray-700">
                    {databaseNavItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 text-sm',
                            isActive
                              ? 'bg-krt-orange/20 text-krt-orange'
                              : 'text-muted hover:bg-card-hover hover:text-primary'
                          )
                        }
                      >
                        <item.icon size={16} />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Admin-Navigation */}
            {isAdmin && adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 mt-4',
                    isActive
                      ? 'bg-krt-orange/20 text-krt-orange border-l-2 border-krt-orange'
                      : 'text-muted hover:bg-card-hover hover:text-primary'
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Theme Toggle & User */}
          <div className="p-4 border-t border-default">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 mb-4 rounded-lg text-muted hover:bg-card-hover hover:text-primary transition-colors"
              title={theme === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              <span className="text-sm">{theme === 'dark' ? 'Heller Modus' : 'Dunkler Modus'}</span>
            </button>

            {/* Vorschaumodus Toggle (nur für Offiziere+) */}
            {canUsePreviewMode() && (
              <button
                onClick={() => setPreviewRole(isInPreviewMode ? null : 'member')}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2 mb-4 rounded-lg transition-colors',
                  isInPreviewMode
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500'
                    : 'text-muted hover:bg-card-hover hover:text-primary'
                )}
                title={isInPreviewMode ? 'Vorschaumodus beenden' : 'Als Viper ansehen'}
              >
                {isInPreviewMode ? <EyeOff size={20} /> : <Eye size={20} />}
                <span className="text-sm">{isInPreviewMode ? 'Vorschau beenden' : 'Als Viper ansehen'}</span>
              </button>
            )}

            <div className="flex items-center gap-3 mb-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className={clsx(
                    'w-10 h-10 rounded-full ring-2',
                    isInPreviewMode ? 'ring-purple-500' : 'ring-default'
                  )}
                />
              ) : (
                <div className={clsx(
                  'w-10 h-10 rounded-full bg-card flex items-center justify-center ring-2',
                  isInPreviewMode ? 'ring-purple-500' : 'ring-default'
                )}>
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {user?.display_name || user?.username}
                </p>
                <p className={clsx(
                  'text-xs capitalize',
                  isInPreviewMode ? 'text-purple-400' : 'text-krt-orange'
                )}>
                  {isInPreviewMode ? `Vorschau: Viper` : user?.role}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-4 py-2 text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              Abmelden
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay für Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 lg:ml-64 overflow-auto relative">
        {/* Vorschaumodus Banner */}
        {isInPreviewMode && (
          <div className="fixed top-0 left-0 right-0 lg:left-64 z-50 bg-purple-600 text-white py-2 px-4 flex items-center justify-center gap-4">
            <Eye size={18} />
            <span className="text-sm font-medium">Vorschaumodus aktiv - Du siehst die Seite als Viper (Mitglied)</span>
            <button
              onClick={() => setPreviewRole(null)}
              className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
            >
              Beenden
            </button>
          </div>
        )}

        {/* KRT Logo Watermark - nur im Dark Mode sichtbar */}
        <div
          className={clsx(
            'fixed right-8 top-1/2 -translate-y-1/2 w-96 h-96 pointer-events-none z-0 transition-opacity duration-200',
            theme === 'dark' ? 'opacity-[0.03]' : 'opacity-[0.02]'
          )}
          style={{
            backgroundImage: 'url(/assets/krt_logo.svg)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            filter: theme === 'dark' ? 'invert(1) brightness(0)' : 'brightness(0)',
          }}
        />
        <div className={clsx('relative z-10', isInPreviewMode && 'mt-10')}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
