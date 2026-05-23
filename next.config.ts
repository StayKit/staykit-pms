import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 / prisma are server-only native deps; keep them external.
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    // Server Actions are enabled by default in Next 15; keep body limit generous
    // for ID-document uploads handled in lib/storage.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
