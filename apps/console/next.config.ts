import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  // a imagem final da Railway serve só .next/standalone (07-infraestrutura-railway.md §3)
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  env: {
    // a console autentica na aplicação Clerk "Console" (staff), separada da
    // aplicação "Plataforma" usada por admin e seller-center (ADR-013)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.CONSOLE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    CLERK_SECRET_KEY: process.env.CONSOLE_CLERK_SECRET_KEY ?? '',
  },
};

export default nextConfig;
