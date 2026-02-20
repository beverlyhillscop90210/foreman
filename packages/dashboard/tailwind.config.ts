import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'foreman-orange': '#FF6B2B',
        'foreman-bg-deep': '#0a0a0a',
        'foreman-bg-dark': '#111111',
        'foreman-bg-medium': '#1a1a1a',
        'foreman-border': '#333333',
        'foreman-border-light': '#444444',
        'foreman-text': '#e5e5e5',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
        'sans': ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config

