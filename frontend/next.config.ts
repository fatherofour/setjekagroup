import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces only the deps each page actually needs into .next/standalone —
  // a `node server.js` production image without shipping full node_modules.
  // Required here (not static export): /projects/[id] and /contractors/[id]
  // are fully dynamic, user-created IDs with no fixed set at build time.
  output: "standalone",
};

export default nextConfig;
