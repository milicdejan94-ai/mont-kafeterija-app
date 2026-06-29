import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mont: {
          dark: "#17120f",
          brown: "#5b3826",
          gold: "#c28a43",
          cream: "#f7efe3"
        }
      }
    },
  },
  plugins: [],
};
export default config;
