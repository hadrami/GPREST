
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
  colors: {
    gp: {
      primary:  "#40916c",
      primary2: "#2d6a4f",
      sky:      "#90e0ef",
      accent:   "#ffff3f",   // <-- this is the app background
      dark:     "#3D3D3D",
    },
  },
}

  },
  plugins: [],
}
