import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hkbu: {
          blue: {
            50: '#f0f5fc',
            100: '#e1ecf9',
            200: '#c3daf3',
            300: '#94beeb',
            400: '#5e9de0',
            500: '#1d74c8',
            600: '#0e55a8',
            700: '#002b66', // Canonical HKBU Navy Blue
            800: '#0b2447',
            900: '#071830',
            950: '#030b17',
          },
          gold: {
            50: '#fffbf0',
            100: '#fef5db',
            200: '#fde9b3',
            300: '#fcd881',
            400: '#fac24b',
            500: '#e5a823', // Canonical HKBU Gold
            600: '#cb8712',
            700: '#a36410',
            800: '#834e14',
            900: '#6c4114',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [typography],
}

