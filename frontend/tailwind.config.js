/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Star Citizen inspirierte Farben
        'sc-dark': '#0a0a0f',
        'sc-darker': '#050508',
        'sc-blue': '#00a8e8',
        'sc-blue-dark': '#007cb5',
        'sc-gold': '#c9a227',
        'sc-red': '#e63946',
        'sc-green': '#2a9d8f',
      },
    },
  },
  plugins: [],
}
