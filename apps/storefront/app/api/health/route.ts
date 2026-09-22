import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Healthcheck do serviço na Railway. Não chama a api nem provedores externos
 * (armadilha #8 de docs/arquitetura/07-infraestrutura-railway.md): mede só
 * se este processo Next.js está respondendo.
 */
export function GET() {
  return NextResponse.json({ status: 'up', app: 'storefront' });
}
