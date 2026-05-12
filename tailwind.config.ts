import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Cor da marca por tenant — lida de --color-primary-rgb (3 ints separados por espaço).
        // Setada no layout (empresa)/painel, /totem/[slug] e /cliente/[slug].
        // Suporta opacidade Tailwind: bg-brand, bg-brand/15, text-brand, border-brand/50.
        brand: {
          DEFAULT: "rgb(var(--color-primary-rgb, 16 185 129) / <alpha-value>)",
          50:  "rgb(var(--color-primary-rgb, 16 185 129) / 0.05)",
          100: "rgb(var(--color-primary-rgb, 16 185 129) / 0.10)",
          200: "rgb(var(--color-primary-rgb, 16 185 129) / 0.20)",
          400: "rgb(var(--color-primary-rgb, 16 185 129) / 0.60)",
          500: "rgb(var(--color-primary-rgb, 16 185 129) / <alpha-value>)",
        },
      },
    }
  },
  plugins: []
};

export default config;
