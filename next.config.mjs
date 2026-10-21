import path from 'path';
import { fileURLToPath } from 'url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin tracing to this project so a stray lockfile in a parent folder can't change what ships.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  serverExternalPackages: ['firebase-admin', 'googleapis', 'jwks-rsa', 'jose'],
  env: {
    // Git SHA of this build, reported by /api/health so post-deploy checks can confirm
    // the expected commit is live. GITHUB_SHA is set when CI runs `vercel build`.
    APP_BUILD_SHA: process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },
};

export default nextConfig;
