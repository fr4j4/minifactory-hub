import type { Config } from 'tailwindcss';
/**
 * Lenguaje visual «capa a capa»: neutros cálidos de grafito (reemplazan a slate en toda la app)
 * y un naranja de boquilla caliente como acento. brand-600+ cumple contraste AA con texto blanco.
 */
export default {
  // oscuro si el sistema lo pide (y no se eligió claro) o si se eligió oscuro a mano (data-theme en <html>)
  darkMode: ['variant', ['@media (prefers-color-scheme: dark) { &:not(:is([data-theme="light"] *)) }', '&:is([data-theme="dark"] *)']],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff4ed', 100: '#ffe4d2', 200: '#ffc6a4', 300: '#ff9e6c', 400: '#ff7a3d', 500: '#ff5b1f', 600: '#c13d0b', 700: '#9c310a', 800: '#7a280c', 900: '#5c1f0b', 950: '#2e0f05' },
        slate: { 50: '#f8f7f4', 100: '#efede8', 200: '#e3e0d8', 300: '#cfcabf', 400: '#a29c90', 500: '#7c776d', 600: '#5b564e', 700: '#46423c', 800: '#2b2a27', 900: '#1d1c1a', 950: '#121211' },
        nozzle: '#ff5b1f',
        paper: '#f3f1ec',
        graphite: '#141413',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', 'var(--font-geist-sans)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        print: { '0%': { clipPath: 'inset(100% 0 0 0)' }, '80%,100%': { clipPath: 'inset(0 0 0 0)' } },
        nozzle: { '0%,100%': { transform: 'translateX(-38px)' }, '50%': { transform: 'translateX(38px)' } },
        fadeIn: { from: { opacity: '0' } },
        fadeOut: { to: { opacity: '0' } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
      },
      animation: { rise: 'rise .35s cubic-bezier(.2,.7,.2,1) backwards', pulseDot: 'pulseDot 1.6s ease-in-out infinite', fadeIn: 'fadeIn .2s ease-out', fadeOut: 'fadeOut .15s ease-in forwards', slideUp: 'slideUp .3s cubic-bezier(.2,.7,.2,1)' },
    },
  },
  plugins: [],
} satisfies Config;
