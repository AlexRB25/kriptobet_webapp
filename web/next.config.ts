import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser-visible variables are named PB_* instead of NEXT_PUBLIC_*, so Next.js only inlines
  // the ones listed here.
  env: {
    PB_SUPABASE_URL: process.env.PB_SUPABASE_URL ?? "",
    PB_SUPABASE_PUBLISHABLE_KEY: process.env.PB_SUPABASE_PUBLISHABLE_KEY ?? "",
    PB_DEMO_MODE: process.env.PB_DEMO_MODE ?? "",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
