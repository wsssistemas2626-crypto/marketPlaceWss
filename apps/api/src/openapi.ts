import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DiscoveryService, NestFactory } from '@nestjs/core';

import { audienceOf, listControllerRoutes, type RouteAudience } from '@mkt/platform';

import { AppModule } from './app.module.js';

/**
 * Gera `docs/api/openapi.json` (`pnpm gen:openapi`).
 *
 * **Por que não `@nestjs/swagger`:** a versão atual quebra em ESM
 * (`loadPackageSync` não é exportado por `@nestjs/common` como módulo ES) e,
 * mais importante, ela pede decorators de schema duplicando o que já está em
 * Zod — e o ADR-002 define o Zod de `packages/contracts` como fonte da verdade
 * dos contratos. Então o documento é montado a partir das rotas realmente
 * registradas, e a Fase 1 enriquece os schemas a partir dos Zod.
 *
 * O CI regenera e compara com o arquivo versionado: mudar contrato sem
 * atualizar a especificação quebra o build (CLAUDE.md §8).
 */
const outputPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/api/openapi.json',
);

/** Cada público tem a sua forma de autenticar (CLAUDE.md §5). */
const SECURITY_BY_AUDIENCE: Record<RouteAudience, string[]> = {
  store: [],
  public: ['apiKey'],
  seller: ['panelToken'],
  admin: ['panelToken'],
  platform: ['consoleToken'],
  other: [],
};

const DESCRIPTION_BY_AUDIENCE: Record<RouteAudience, string> = {
  store: 'Comprador — tenant resolvido pelo host.',
  public: 'Integrações do seller — autenticação por API key.',
  seller: 'Painel do vendedor — organização kind=seller na Clerk.',
  admin: 'Backoffice do operador — organização kind=tenant na Clerk.',
  platform: 'Staff da plataforma — aplicação Clerk Console, sem tenant.',
  other: 'Infraestrutura.',
};

async function main(): Promise<void> {
  // criar a aplicação não abre conexão: o pool do Postgres e o Redis são preguiçosos
  const application = await NestFactory.create(AppModule, { logger: false });
  application.setGlobalPrefix('v1', { exclude: ['health'] });
  await application.init();

  const routes = listControllerRoutes(application.get(DiscoveryService), {
    globalPrefix: 'v1',
    excludedFromPrefix: ['health'],
  });
  await application.close();

  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const audience = audienceOf(route.path);
    // OpenAPI usa {param}; o Express registra :param
    const openApiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const parameters = [...openApiPath.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));

    paths[openApiPath] ??= {};
    paths[openApiPath][route.method.toLowerCase()] = {
      tags: [audience],
      summary: `${route.method} ${openApiPath}`,
      description: DESCRIPTION_BY_AUDIENCE[audience],
      ...(parameters.length === 0 ? {} : { parameters }),
      security: SECURITY_BY_AUDIENCE[audience].map((scheme) => ({ [scheme]: [] })),
      responses: {
        '2XX': { description: 'Sucesso' },
        '4XX': {
          description: 'Erro de cliente (RFC 9457)',
          content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
        },
      },
    };
  }

  const document = {
    openapi: '3.1.0',
    info: {
      title: 'Marketplace API',
      version: '0.1.0',
      description:
        'API do marketplace multi-tenant. Rotas por público: /v1/store (comprador), /v1/seller ' +
        '(vendedor), /v1/admin (operador do tenant), /v1/public (integrações) e /v1/platform (staff). ' +
        'Erros no formato RFC 9457. Gerado por `pnpm gen:openapi` — não edite à mão.',
    },
    servers: [{ url: 'https://api.{plataforma}', variables: { plataforma: { default: 'localhost:3100' } } }],
    paths,
    components: {
      securitySchemes: {
        panelToken: { type: 'http', scheme: 'bearer', description: 'Token de sessão da Clerk (painéis)' },
        consoleToken: { type: 'http', scheme: 'bearer', description: 'Token da Clerk Console (staff)' },
        apiKey: { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
      },
      schemas: {
        Problem: {
          type: 'object',
          required: ['type', 'title', 'status', 'code'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            code: { type: 'string' },
            instance: { type: 'string' },
            correlation_id: { type: 'string' },
          },
        },
      },
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log(`OpenAPI gerado: ${Object.keys(paths).length} caminhos em ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
