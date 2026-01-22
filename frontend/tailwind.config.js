/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Kartell Farben - Orange Akzent
        'krt': {
          'orange': '#E85A24',
          'orange-dark': '#C94A1A',
          'orange-light': '#F26522',
        },
        // Überschreibe die Standard-Grau-Palette mit neutralen Grautönen (kein Blau!)
        // Angepasst für besseren Kontrast
        'gray': {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#3d3d3d',
          800: '#2d2d2d',  // Heller für besseren Kontrast auf dunklen Cards
          900: '#1a1a1a',
          950: '#0f0f0f',
        },
        // Semantische Farben (ersetzen sc-red, sc-green etc.)
        'success': '#22c55e',
        'error': '#ef4444',
        'warning': '#f59e0b',
        // Legacy aliases für bestehenden Code
        'sc-red': '#ef4444',
        'sc-green': '#22c55e',
        'sc-gold': '#f59e0b',
      },
      backgroundColor: {
        'page': 'var(--bg-page)',
        'card': 'var(--bg-card)',
        'card-hover': 'var(--bg-card-hover)',
        'input': 'var(--bg-input)',
        'sidebar': 'var(--bg-sidebar)',
        'element': 'var(--bg-element)',
        'element-hover': 'var(--bg-element-hover)',
      },
      textColor: {
        'primary': 'var(--text-primary)',
        'secondary': 'var(--text-secondary)',
        'muted': 'var(--text-muted)',
      },
      borderColor: {
        'default': 'var(--border-color)',
        'hover': 'var(--border-hover)',
      },
      ringColor: {
        DEFAULT: '#E85A24',
      },
      outlineColor: {
        DEFAULT: '#E85A24',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'inner': 'var(--shadow-inner)',
        'element': 'var(--shadow-element)',
        'glow-orange': 'var(--shadow-glow-orange)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1rem',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
