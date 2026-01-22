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
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/attendance', icon: ClipboardList, label: 'Anwesenheit' },
  { to: '/loot', icon: Gift, label: 'Loot' },
  { to: '/inventory', icon: Package, label: 'Lager' },
  { to: '/items', icon: Boxes, label: 'Items' },
  { to: '/components', icon: Search, label: 'Component Browser' },
  { to: '/locations', icon: MapPin, label: 'Standorte' },
  { to: '/treasury', icon: Wallet, label: 'Kasse' },
  { to: '/users', icon: Users, label: 'Benutzer' },
  { to: '/admin', icon: Settings, label: 'Admin', adminOnly: true },
] as const

export default function Layout() {
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-default transform transition-transform duration-200 shadow-lg',
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
            {navItems
              .filter((item) => !('adminOnly' in item && item.adminOnly) || user?.role === 'admin')
              .map((item) => (
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

            <div className="flex items-center gap-3 mb-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-full ring-2 ring-default"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center ring-2 ring-default">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {user?.display_name || user?.username}
                </p>
                <p className="text-xs text-krt-orange capitalize">{user?.role}</p>
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
      <main className="flex-1 p-6 lg:p-8 overflow-auto relative">
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
        <div className="relative z-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
