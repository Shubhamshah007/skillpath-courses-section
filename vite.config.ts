import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

// The component imports `addPropertyControls` and `ControlType` from "framer", which only
// exists inside Framer. Aliasing it to a local stub lets the SAME file run here unchanged,
// so there is nothing to add or strip before pasting it into Framer.
export default defineConfig({
  root: "preview",
  resolve: {
    alias: {
      framer: resolve(__dirname, "preview/framer-shim.ts"),
    },
  },
})
