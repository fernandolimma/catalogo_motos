/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#142018",
        pine: "#224d38",
        lime: "#c5e85b",
        paper: "#f7f8f3",
        muted: "#718074",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(20, 32, 24, .08)",
      },
    },
  },
  plugins: [],
};
