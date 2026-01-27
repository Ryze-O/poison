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
        // Custom Gray Palette - Neutral mit leichtem Cool-Tone für Tech-Look
        // Optimiert für besseren Kontrast auf dunklen Backgrounds
        'gray': {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',  // Deutlich heller für gute Lesbarkeit
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#2a2a32',  // Leicht aufgehellt
          900: '#1c1c22',
          950: '#0f0f12',
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
