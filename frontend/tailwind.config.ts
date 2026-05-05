import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15161a",
        panel: "#f6f7f9",
        line: "#d9dde5",
        accent: "#0f766e",
      },
    },
  },
  plugins: [],
};

export default config;

