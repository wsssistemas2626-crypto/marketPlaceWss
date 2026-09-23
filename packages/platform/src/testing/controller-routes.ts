import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import type { HttpMethod, RegisteredRoute } from './isolation-suite.js';

/**
 * Rotas **declaradas pelos controllers**, lidas dos metadados do Nest.
 *
 * Ler o router do Express parecia mais simples, mas traz junto o que não é
 * rota: middleware registrado com `RequestMethod.ALL` aparece como um caminho
 * com todos os métodos, e o `exclude` do prefixo global também deixa rastro.
 * Os metadados dos controllers descrevem exatamente o que a aplicação expõe —
 * que é o que a suíte de isolamento e o OpenAPI precisam.
 */
const METHOD_NAMES: Partial<Record<RequestMethod, HttpMethod>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

const joinPath = (...parts: string[]): string =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('/')}`;

export interface ControllerRouteOptions {
  /** Prefixo global da API (ex.: `v1`). */
  readonly globalPrefix?: string;
  /** Caminhos que o prefixo não cobre (ex.: `health`). */
  readonly excludedFromPrefix?: readonly string[];
}

export function listControllerRoutes(
  discovery: DiscoveryService,
  options: ControllerRouteOptions = {},
): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const prefix = options.globalPrefix ?? '';
  const excluded = options.excludedFromPrefix ?? [];

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype;
    if (typeof controller !== 'function') continue;

    const basePath = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const prototype = controller.prototype as object;

    for (const property of Object.getOwnPropertyNames(prototype)) {
      if (property === 'constructor') continue;

      const handler = (prototype as Record<string, unknown>)[property];
      if (typeof handler !== 'function') continue;

      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const httpMethod = method === undefined ? undefined : METHOD_NAMES[method];
      if (httpMethod === undefined) continue;

      const handlerPath = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const withoutPrefix = joinPath(basePath, handlerPath);
      const isExcluded = excluded.some((path) => withoutPrefix === joinPath(path));

      routes.push({
        method: httpMethod,
        path: isExcluded || prefix === '' ? withoutPrefix : joinPath(prefix, withoutPrefix),
        controller,
        handler,
      });
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
