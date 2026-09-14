export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4c8dff',
        dark: {
          bg: '#0c0e12',
          surface: '#161b22',
          border: '#21262d',
          hover: '#1f2937'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
