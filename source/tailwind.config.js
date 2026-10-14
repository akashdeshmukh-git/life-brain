/* Tailwind is compiled at build time into the single index.html, so the app still opens offline.
   Colours are CSS variables (space-separated RGB) so light, dark and the accent picker swap them at runtime. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  content: ['./src/js/*.js', './src/body.html'],
  theme: {
    extend: {
      colors: {
        ink: v('ink'), muted: v('muted'), faint: v('faint'),
        canvas: v('canvas'), raised: v('raised'), sunk: v('sunk'), line: v('line'),
        brand: v('brand'), 'on-brand': v('on-brand'),
        good: v('good'), 'good-bg': v('good-bg'), warn: v('warn'), 'warn-bg': v('warn-bg'), bad: v('bad'), 'bad-bg': v('bad-bg'),
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        lift: '0 1px 2px rgb(var(--shadow) / .06), 0 8px 24px -6px rgb(var(--shadow) / .18)',
        sheet: '0 -8px 40px -12px rgb(var(--shadow) / .35)',
      },
    },
  },
  plugins: [],
};
