import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The library lives two directories up (npm workspace); let Turbopack see it.
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
};

export default nextConfig;
