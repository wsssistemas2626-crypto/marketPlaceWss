import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  assertRuntimeRoleIsSafe,
  createLogger,
  DATABASE_POOL,
  PinoNestLogger,
  startTracing,
  type DatabasePool,
} from '@mkt/platform';

import { AppModule } from './app.module.js';
import { loadApiEnv } from './env.js';

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();

  // traces só quando há coletor configurado (RNF-OBS-01)
  const tracing = await startTracing({ serviceName: 'api', environment: env.nodeEnv });

  const logger = createLogger({
    service: 'api',
    environment: env.nodeEnv,
    pretty: env.nodeEnv === 'development',
  });
  const app = await NestFactory.create(AppModule, { logger: new PinoNestLogger(logger) });

  // Convenções (CLAUDE.md §5): REST sob /v1. O /health fica fora do prefixo
  // porque é o caminho configurado no healthcheck da Railway.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // o processo não sobe conectado com superusuário: isso desligaria a RLS
  // e o isolamento entre tenants sumiria em silêncio (ADR-014, armadilha #1)
  await assertRuntimeRoleIsSafe(app.get<DatabasePool>(DATABASE_POOL));

  // SIGTERM da Railway: fecha pool, conexões e exportador de traces (armadilha #5)
  app.enableShutdownHooks();
  process.on('SIGTERM', () => void tracing.shutdown());

  // PORT vem da Railway; escutar em `::` atende IPv4 e IPv6 (armadilha #2).
  await app.listen(env.port, '::');

  new Logger('Bootstrap').log(`api ouvindo em [::]:${env.port} (${env.nodeEnv})`);
}

void bootstrap();
