import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        ring: "hsl(var(--ring))"
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem"
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "serif"],
        body: ["'IBM Plex Sans Condensed'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"]
      },
      boxShadow: {
        paper: "0 20px 60px rgba(28, 41, 59, 0.08)",
        editor: "0 18px 40px rgba(27, 39, 51, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
