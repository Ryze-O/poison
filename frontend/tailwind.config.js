/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kartell Farben
        'krt': {
          'dark': '#1a1a1a',
          'darker': '#121212',
          'darkest': '#0a0a0a',
          'orange': '#E85A24',
          'orange-dark': '#C94A1A',
          'orange-light': '#F26522',
          'silver': '#A8A8A8',
          'gold': '#c9a227',
        },
        // Legacy aliases
        'sc-dark': '#1a1a1a',
        'sc-darker': '#121212',
        'sc-blue': '#E85A24',
        'sc-blue-dark': '#C94A1A',
        'sc-gold': '#c9a227',
        'sc-red': '#e63946',
        'sc-green': '#2a9d8f',
      },
      backgroundImage: {
        'krt-gradient': 'linear-gradient(180deg, #2d2d2d 0%, #1a1a1a 50%, #0a0a0a 100%)',
        'krt-card': 'linear-gradient(145deg, #242424 0%, #1a1a1a 100%)',
      },
    },
  },
  plugins: [],
}
