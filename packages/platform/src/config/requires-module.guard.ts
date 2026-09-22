import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ConfigService } from './config.service.js';

const REQUIRES_MODULE = 'mkt:requires-module';

/**
 * Exige que o plano do tenant inclua o módulo (CLAUDE.md §4.13).
 *
 * Só a **funcionalidade** é bloqueada: o módulo desligado continua consumindo
 * eventos necessários à consistência (`06-multi-tenancy.md` §8).
 */
export const RequiresModule = (moduleName: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_MODULE, moduleName);

@Injectable()
export class RequiresModuleGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleName = this.reflector.getAllAndOverride<string>(REQUIRES_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (moduleName === undefined) return true;

    await this.config.assertModuleEnabled(moduleName);
    return true;
  }
}
