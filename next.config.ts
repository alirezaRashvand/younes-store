import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/** Host of the configured public S3/CDN base URL (so uploads always render). */
function configuredStoragePattern(): RemotePattern | null {
  const raw = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
  } catch {
    return null;
  }
}

const remotePatterns: RemotePattern[] = [
  // Common S3-compatible providers
  { protocol: "https", hostname: "**.amazonaws.com" },
  { protocol: "https", hostname: "**.arvanstorage.ir" },
  { protocol: "https", hostname: "**.arvanstorage.com" },
  { protocol: "https", hostname: "**.liara.space" },
  { protocol: "https", hostname: "**.r2.dev" },
  { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
  { protocol: "https", hostname: "**.digitaloceanspaces.com" },
  { protocol: "https", hostname: "**.backblazeb2.com" },
  // Local MinIO / dev storage
  { protocol: "http", hostname: "localhost", port: "9000" },
  { protocol: "http", hostname: "127.0.0.1", port: "9000" },
];

const storagePattern = configuredStoragePattern();
if (storagePattern) remotePatterns.push(storagePattern);

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Storefront components render with `unoptimized` today; these patterns keep
    // optimized <Image> usage working for the same hosts if that changes.
    remotePatterns,
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
