/** @type {import('tailwindcss').Config} */
module.exports = {
  // The dark theme is a token override on [data-theme="dark"] (see index.css).
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Every entry resolves to a tier-2 semantic token. Opacity modifiers
      // (bg-surface/50) are not supported on these by design — use a dedicated
      // token instead so contrast stays computable.
      colors: {
        background: 'var(--bg-app)',
        foreground: 'var(--text-1)',
        surface: {
          DEFAULT: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          hover: 'var(--surface-hover)',
          selected: 'var(--surface-selected)',
        },
        border: {
          DEFAULT: 'var(--border-subtle)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          fill: 'var(--accent-fill)',
          weak: 'var(--accent-weak)',
          ink: 'var(--accent-ink)',
        },
        muted: {
          DEFAULT: 'var(--surface-2)',
          foreground: 'var(--text-3)',
        },
        status: {
          open: 'var(--status-open-fg)',
          scheduled: 'var(--status-scheduled-fg)',
          active: 'var(--status-active-fg)',
          hold: 'var(--status-hold-fg)',
          done: 'var(--status-done-fg)',
          void: 'var(--status-void-fg)',
          overdue: 'var(--status-overdue-fg)',
          breakdown: 'var(--status-breakdown-fg)',
        },
        nav: {
          DEFAULT: 'var(--nav-bg)',
          text: 'var(--nav-text)',
          active: 'var(--nav-active-bg)',
          accent: 'var(--nav-accent)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['20px', { lineHeight: '26px' }],
        '2xl': ['24px', { lineHeight: '30px' }],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '8px',
      },
      height: {
        control: 'var(--control-h)',
        row: 'var(--row-h)',
      },
      minHeight: {
        row: 'var(--row-h)',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        pop: '0 8px 24px rgb(16 24 40 / 0.12)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
