/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0a7d4f', // Palestinian green
          dark: '#075c3a',
          light: '#e6f4ee',
        },
        flag: { red: '#ce1126', black: '#111111' },
      },
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
