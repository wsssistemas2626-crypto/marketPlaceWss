import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Redis } from 'ioredis';

import { AppModule } from './app.module.js';
import { loadWorkerEnv } from './env.js';
import { assertRedisEvictionPolicy } from './infrastructure/assert-redis-eviction-policy.js';
import { REDIS_CLIENT } from './infrastructure/infrastructure.module.js';

async function bootstrap(): Promise<void> {
  const env = loadWorkerEnv();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // SIGTERM: drena jobs em andamento antes de sair (armadilha #5).
  app.enableShutdownHooks();

  const redis = app.get<Redis>(REDIS_CLIENT);
  await redis.connect();
  await assertRedisEvictionPolicy(redis, {
    isProduction: env.isProduction,
    warn: (message) => logger.warn(message),
  });

  // Porta interna, sem domínio público; mesmo assim lê PORT e escuta em `::`.
  await app.listen(env.port, '::');

  logger.log(`worker ouvindo em [::]:${env.port} (${env.nodeEnv})`);
}

void bootstrap();
