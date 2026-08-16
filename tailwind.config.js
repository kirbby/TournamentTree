import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.js"],
  theme: {
    extend: {
      colors: {
        ink: "var(--app-text)",
        paper: "var(--app-bg)",
        accent: "var(--color-primary)",
        white: "var(--color-text)",
        slate: {
          50: "var(--surface-bg-subtle)",
          100: "var(--surface-bg-subtle)",
          200: "var(--surface-border)",
          300: "var(--surface-border)",
          400: "var(--app-text-muted)",
          500: "var(--app-text-muted)",
          600: "var(--app-text-muted)",
          700: "var(--app-text)",
          800: "var(--button-secondary-bg-hover)",
          900: "var(--color-bg-deep)",
          950: "var(--color-bg-deep)",
        },
        blue: {
          50: "var(--color-info-bg)",
          100: "var(--color-primary-soft)",
          200: "var(--color-primary-border)",
          300: "var(--color-primary)",
          500: "var(--color-primary)",
          600: "var(--color-primary)",
          700: "var(--color-primary-hover)",
          800: "var(--color-info-text)",
        },
        red: { 50: "var(--surface-bg-subtle)", 200: "var(--status-danger)", 600: "var(--status-danger)", 700: "var(--status-danger)", 800: "var(--status-danger)" },
        green: { 50: "var(--surface-bg-subtle)", 100: "var(--surface-bg-subtle)", 700: "var(--status-success)", 800: "var(--status-success)" },
        amber: { 100: "var(--surface-bg-subtle)", 700: "var(--status-warning)", 800: "var(--status-warning)", 900: "var(--status-warning)" },
        yellow: { 50: "var(--surface-bg-subtle)" },
      },
    },
  },
  plugins: [forms],
};
