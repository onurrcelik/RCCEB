import type { Config } from "tailwindcss";

// RCCEB brand tokens (from the brand library: navy / cream / gold, Playfair Display + Inter).
//
// The portal code was inherited from Exposure and leans on Tailwind's neutral scales, so
// rather than rewriting every class the neutrals themselves are re-pointed at the brand:
// `zinc` is a navy-tinted scale (the dark member portal), `slate` a cream-to-navy scale
// (the light admin dashboard). New code should prefer `navy`, `cream` and `gold`.
const navy = {
  50: '#eef2f9',
  100: '#d6e0f0',
  200: '#b2c2dd',
  300: '#8a9fc4',
  400: '#5f78a5',
  500: '#3d5689',
  600: '#2b4679',
  700: '#213b6d',
  800: '#172b52',
  900: '#0e1b2d',
  925: '#0f1729', // dark-theme sidebar
  950: '#0a1628',
};

const gold = {
  50: '#faf5ea',
  100: '#f3ead8',
  200: '#e8d6b2',
  300: '#dcc08a',
  400: '#c4a265',
  500: '#ae8d51',
  600: '#91723a',
  700: '#745925',
  800: '#5b4312',
  900: '#4a3710',
  950: '#2e1b00',
};

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy,
        gold,
        cream: {
          DEFAULT: '#f4f1ea',
          50: '#fbf9f4',
          100: '#f4f1ea',
          200: '#ebe7df',
          300: '#dbd7cf',
        },
        // Dark surfaces (member portal).
        zinc: {
          50: '#f4f1ea',
          100: '#ebe7df',
          200: '#d6d3cc',
          300: '#b6bac4',
          400: '#9ca5b5',
          500: '#7a8497',
          600: '#566075',
          700: '#343f55',
          800: '#232e45',
          900: '#141f38',
          950: '#0a1628',
        },
        // Light surfaces (admin dashboard).
        slate: {
          50: '#fbf9f4',
          100: '#f3efe6',
          200: '#e3ded3',
          300: '#c9c4b8',
          400: '#8f95a0',
          500: '#575e69',
          600: '#3f4757',
          700: '#2a3446',
          800: '#1a2538',
          900: '#0e1b2d',
          950: '#0a1628',
        },
        'brand-blue': {
          400: navy[600],
          500: navy[700],
          600: navy[800],
        },
        primary: navy[700],
        'text-primary': navy[900],
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
