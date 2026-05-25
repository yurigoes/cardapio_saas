import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand, #7c3aed)",   // dinâmico via branding do master
          dark:    "var(--brand-dark, #5b21b6)",
          light:   "var(--brand-light, #a78bfa)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
