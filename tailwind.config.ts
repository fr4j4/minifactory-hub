import type { Config } from 'tailwindcss';
export default {
  darkMode: 'media',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef6ff', 100: '#d9eaff', 200: '#bcdaff', 300: '#8ec3ff', 400: '#59a2ff', 500: '#3380fb', 600: '#1d62f0', 700: '#154ddd', 800: '#183eb3', 900: '#193a8d' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
