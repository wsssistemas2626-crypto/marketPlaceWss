import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadApiEnv } from './env.js';

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const app = await NestFactory.create(AppModule);

  // Convenções (CLAUDE.md §5): REST sob /v1. O /health fica fora do prefixo
  // porque é o caminho configurado no healthcheck da Railway.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // SIGTERM da Railway fecha pool e conexões (armadilha #5).
  app.enableShutdownHooks();

  // PORT vem da Railway; escutar em `::` atende IPv4 e IPv6 (armadilha #2).
  await app.listen(env.port, '::');

  new Logger('Bootstrap').log(`api ouvindo em [::]:${env.port} (${env.nodeEnv})`);
}

void bootstrap();
