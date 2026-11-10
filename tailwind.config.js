/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // <-- Add this line
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};