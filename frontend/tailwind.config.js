/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#fff7ed', 100:'#ffedd5', 500:'#f97316', 600:'#ea580c', 700:'#c2410c', 900:'#7c2d12' },
        dark: { 800:'#1e1e2e', 900:'#0f0f1a' }
      },
      fontFamily: { sans: ['"DM Sans"','sans-serif'] }
    }
  },
  plugins: []
}
