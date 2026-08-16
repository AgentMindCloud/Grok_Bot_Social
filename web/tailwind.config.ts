import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        peach: {
          50: "#fff5f0",
          100: "#ffe8e0",
          200: "#ffd6c9",
          300: "#ffb3a0",
        },
        pink: {
          400: "#ff6bcb",
          500: "#ff4da6",
        },
      },
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 32px rgba(255, 105, 180, 0.08)",
        neon: "0 0 20px rgba(255, 107, 203, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
