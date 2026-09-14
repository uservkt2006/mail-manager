export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        dark: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          border: 'var(--border)',
          hover: 'var(--hover)'
        },
        ink: {
          DEFAULT: 'var(--text)',
          strong: 'var(--text-strong)',
          dim: 'var(--text-dim)',
          mute: 'var(--text-mute)'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
