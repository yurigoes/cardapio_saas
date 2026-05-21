import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#7c3aed",   // roxo — diferencia do verde do restaurante
          dark:    "#5b21b6",
          light:   "#a78bfa",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
