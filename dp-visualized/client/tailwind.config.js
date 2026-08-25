/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0C11",
        panel: "#0D0F16",
        raised: "#12151f",
        line: "#232838",
        accent: { DEFAULT: "#818CF8", dim: "#4F46E5" },
        known: "#22C55E",
        body: "#9AA3B5",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
