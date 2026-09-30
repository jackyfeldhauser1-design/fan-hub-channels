import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import tsConfigPaths from "vite-tsconfig-paths";

const publicSupabaseUrl =
  process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"] || "";
const publicSupabaseKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  "";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicSupabaseKey),
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    netlify(),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});
