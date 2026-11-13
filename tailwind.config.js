/** @type {import('tailwindcss').Config} */
// Colors point at the CSS variables defined in src/index.css so light/dark mode works everywhere.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [{ pattern: /^hn-/ }, 's', 'solid', 'in', 'a', 'b', 'b2', 'active'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        sf: 'var(--sf)',
        tx: 'var(--tx)',
        mu: 'var(--mu)',
        ln: 'var(--ln)',
        bd: 'var(--bd)',
        bl: 'var(--bl)',
        ye: 'var(--ye)',
        ink: 'var(--ink)',
        ac: 'var(--ac)',
        warn: { bg: 'var(--warn-bg)', tx: 'var(--warn-tx)' },
        danger: { bg: 'var(--danger-bg)', tx: 'var(--danger-tx)' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
