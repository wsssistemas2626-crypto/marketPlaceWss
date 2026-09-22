import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  // a imagem final da Railway serve só .next/standalone (07-infraestrutura-railway.md §3)
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
};

export default nextConfig;
