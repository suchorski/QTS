const withTailwindcss = require("tailwindcss");

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1e3a8a",
        secondary: "#c0c0c0",
        accent: "#0f172a",
      },
    },
  },
  plugins: [],
};
