import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import type { PendingRequestsCount } from '../api/types'
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
  Shield,
  Crosshair,
} from 'lucide-react'
import { useState, useRef } from 'react'
import clsx from 'clsx'

// Dashboard (immer sichtbar, standalone)
const dashboardItem = { to: '/', icon: Home, label: 'Dashboard' }

// Navigation-Kategorien
const navCategories = [
  {
    id: 'einsaetze',
    label: 'Einsätze',
    icon: Crosshair,
    items: [
      { to: '/struktur', icon: Shield, label: 'Viper-Struktur' },
      { to: '/einsaetze', icon: Crosshair, label: 'Einsätze' },
      { to: '/attendance', icon: ClipboardList, label: 'Staffelabende' },
      { to: '/loot', icon: Gift, label: 'Freeplay (Loot)' },
    ],
  },
  {
    id: 'verwaltung',
    label: 'Verwaltung',
    icon: Package,
    items: [
      { to: '/inventory', icon: Package, label: 'Lager' },
      { to: '/treasury', icon: Wallet, label: 'Kasse' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: Search,
    items: [
      { to: '/components', icon: Search, label: 'Item Search' },
    ],
  },
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
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarHover, setSidebarHover] = useState(false)
  const [databaseExpanded, setDatabaseExpanded] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    einsaetze: true,
    verwaltung: true,
    tools: true,
  })
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Staffelstruktur-Seite: Sidebar standardmäßig ausblenden
  const isStrukturPage = location.pathname === '/struktur'
  const shouldHideSidebar = isStrukturPage && !sidebarHover

  const handleHoverZoneEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setSidebarHover(true)
  }

  const handleHoverZoneLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setSidebarHover(false)
    }, 300)
  }

  const isInPreviewMode = previewRole !== null
  const effectiveRole = previewRole || user?.role
  const isOfficerOrHigher = effectiveRole === 'officer' || effectiveRole === 'treasurer' || effectiveRole === 'admin'
  const isAdmin = !isInPreviewMode && user?.role === 'admin'
  const isPioneer = user?.is_pioneer === true

  // Transfer-Anfragen für Pioneers laden
  const { data: pendingCount } = useQuery<PendingRequestsCount>({
    queryKey: ['transfer-requests', 'pending', 'count'],
    queryFn: async () => {
      const response = await apiClient.get('/api/inventory/transfer-requests/pending/count')
      return response.data
    },
    enabled: isPioneer || isAdmin,
    refetchInterval: 30000, // Alle 30 Sekunden aktualisieren
  })

  // Pending Merges für Admins laden
  const { data: pendingMergesCount } = useQuery<{ count: number }>({
    queryKey: ['pending-merges', 'count'],
    queryFn: async () => {
      const response = await apiClient.get('/api/users/pending-merges/count')
      return response.data
    },
    enabled: isAdmin,
    refetchInterval: 60000, // Alle 60 Sekunden aktualisieren
  })

  // Anzahl der Anfragen die der Pioneer bearbeiten muss
  const pioneerPendingCount = (pendingCount?.as_owner_pending ?? 0) + (pendingCount?.as_owner_approved ?? 0)

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  return (
    <div className="min-h-screen flex bg-page text-primary">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg border border-default"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Hover Zone für Staffelstruktur-Seite (links am Rand) */}
      {isStrukturPage && !sidebarHover && (
        <div
          className="fixed inset-y-0 left-0 w-4 z-50 hidden lg:block"
          onMouseEnter={handleHoverZoneEnter}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={isStrukturPage ? handleHoverZoneEnter : undefined}
        onMouseLeave={isStrukturPage ? handleHoverZoneLeave : undefined}
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-default transform transition-transform duration-200 shadow-lg',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: Nur verstecken wenn Struktur-Seite und nicht gehovert
          !sidebarOpen && !shouldHideSidebar && 'lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-default">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h1
                  className="text-2xl font-bold tracking-wider text-poison-neon"
                  style={{ textShadow: '0 0 20px rgba(57, 255, 20, 0.5), 0 0 40px rgba(57, 255, 20, 0.2)' }}
                >
                  POISON
                </h1>
                <p className="text-sm font-medium tracking-wide text-gray-300 mt-1">Staffel Viper</p>
                <p className="text-[10px] text-krt-orange tracking-widest mt-0.5">DAS KARTELL</p>
              </div>
              <img
                src="/assets/Staffel-Viper-RWK 2019-750px.png"
                alt="Staffel Viper"
                className="w-14 h-14 object-contain"
              />
            </div>
            {/* Orange Akzent-Linie */}
            <div className="mt-4 h-px bg-gradient-to-r from-krt-orange via-krt-orange to-transparent" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {/* Dashboard (standalone) */}
            <NavLink
              to={dashboardItem.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-krt-orange/20 text-krt-orange border-l-2 border-krt-orange shadow-[0_0_20px_rgba(232,90,36,0.15)]'
                    : 'text-gray-400 hover:bg-card-hover hover:text-white hover:shadow-sm'
                )
              }
            >
              <dashboardItem.icon size={20} />
              <span className="flex-1">{dashboardItem.label}</span>
            </NavLink>

            {/* Kategorien */}
            {navCategories.map((category) => (
              <div key={category.id} className="mt-2">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-gray-500 hover:text-gray-300 transition-all duration-200"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider">{category.label}</span>
                  {expandedCategories[category.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expandedCategories[category.id] && (
                  <div className="space-y-1">
                    {category.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200',
                            isActive
                              ? 'bg-krt-orange/20 text-krt-orange border-l-2 border-krt-orange shadow-[0_0_20px_rgba(232,90,36,0.15)]'
                              : 'text-gray-400 hover:bg-card-hover hover:text-white hover:shadow-sm'
                          )
                        }
                      >
                        <item.icon size={18} />
                        <span className="flex-1">{item.label}</span>
                        {/* Badge für Lager - nur für Pioneers */}
                        {item.to === '/inventory' && isPioneer && pioneerPendingCount > 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {pioneerPendingCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Datenbank-Kategorie (nur für Offiziere+) */}
            {isOfficerOrHigher && (
              <>
                <button
                  onClick={() => setDatabaseExpanded(!databaseExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-400 hover:bg-card-hover hover:text-white transition-all duration-200 mt-4"
                >
                  <div className="flex items-center gap-3">
                    <Database size={20} />
                    <span>Datenbank</span>
                  </div>
                  {databaseExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {databaseExpanded && (
                  <div className="ml-4 space-y-1 border-l border-gray-600/50">
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
                              : 'text-gray-400 hover:bg-card-hover hover:text-white'
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
                      ? 'bg-krt-orange/20 text-krt-orange border-l-2 border-krt-orange shadow-[0_0_20px_rgba(232,90,36,0.15)]'
                      : 'text-gray-400 hover:bg-card-hover hover:text-white hover:shadow-sm'
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
                {item.to === '/admin' && (pendingMergesCount?.count ?? 0) > 0 && (
                  <span className="ml-auto bg-krt-orange text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {pendingMergesCount?.count}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Theme Toggle & User */}
          <div className="p-4 border-t border-default">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 mb-4 rounded-lg text-gray-400 hover:bg-card-hover hover:text-white transition-colors"
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
                    ? 'bg-gray-700/50 text-white border border-dashed border-gray-500'
                    : 'text-gray-400 hover:bg-card-hover hover:text-white'
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
                    isInPreviewMode ? 'ring-gray-500 ring-dashed' : 'ring-default'
                  )}
                />
              ) : (
                <div className={clsx(
                  'w-10 h-10 rounded-full bg-card flex items-center justify-center ring-2',
                  isInPreviewMode ? 'ring-gray-500' : 'ring-default'
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
                  isInPreviewMode ? 'text-gray-400 italic' : 'text-krt-orange'
                )}>
                  {isInPreviewMode ? `Vorschau: Viper` : user?.role}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-4 py-2 text-gray-400 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
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
      <main className={clsx(
        'flex-1 pt-16 px-4 pb-6 lg:pt-8 lg:px-8 lg:pb-8 overflow-auto relative transition-[margin] duration-200',
        // Margin für Sidebar, außer auf Staffelstruktur-Seite (wenn Sidebar versteckt)
        shouldHideSidebar ? 'lg:ml-0' : 'lg:ml-64'
      )}>
        {/* Vorschaumodus Banner */}
        {isInPreviewMode && (
          <div className={clsx(
            'fixed top-0 left-0 right-0 z-50 bg-gray-800 border-b border-dashed border-gray-600 text-gray-300 py-2 px-4 flex items-center justify-center gap-4 transition-[left] duration-200',
            shouldHideSidebar ? 'lg:left-0' : 'lg:left-64'
          )}>
            <Eye size={18} />
            <span className="text-sm font-medium">Vorschaumodus aktiv - Du siehst die Seite als Viper (Mitglied)</span>
            <button
              onClick={() => setPreviewRole(null)}
              className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
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
