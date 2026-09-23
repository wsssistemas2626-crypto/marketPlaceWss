/**
 * Harness de isolamento entre tenants (US-074 / RNF-TEN-01).
 *
 * A ideia é simples e deliberada: em vez de cada story escrever o seu teste
 * cross-tenant e alguém esquecer um dia, a suíte **descobre as rotas
 * registradas** e prova, para cada uma, que o tenant A não alcança nada do
 * tenant B. Rota nova entra na suíte sozinha.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RegisteredRoute {
  readonly method: HttpMethod;
  /** Caminho como o framework registrou, ex.: `/v1/store/widgets/:id`. */
  readonly path: string;
  /** Classe e método de origem — é neles que ficam os decorators de acesso. */
  readonly controller?: object;
  readonly handler?: object;
}

/** Público da rota — define qual credencial o teste usa. */
export type RouteAudience = 'store' | 'seller' | 'admin' | 'public' | 'platform' | 'other';

export function audienceOf(path: string): RouteAudience {
  const match = /^\/v\d+\/(store|seller|admin|public|platform)\b/.exec(path);
  return (match?.[1] as RouteAudience | undefined) ?? 'other';
}

/** Rotas que carregam tenant e, por isso, precisam ser provadas. */
export const TENANT_SCOPED_AUDIENCES: readonly RouteAudience[] = ['store', 'seller', 'admin', 'public'];

/**
 * Extrai as rotas de um app Nest sobre Express, sem depender de tipos do
 * Express (que o pacote não declara).
 */
export function listRegisteredRoutes(httpAdapterInstance: unknown): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];

  const router =
    (httpAdapterInstance as { router?: { stack?: unknown[] }; _router?: { stack?: unknown[] } })?.router ??
    (httpAdapterInstance as { _router?: { stack?: unknown[] } })?._router;

  for (const layer of router?.stack ?? []) {
    const route = (layer as { route?: { path?: unknown; methods?: Record<string, boolean> } }).route;
    if (route?.path === undefined) continue;

    const paths = Array.isArray(route.path) ? route.path : [route.path];
    for (const path of paths) {
      for (const [method, enabled] of Object.entries(route.methods ?? {})) {
        if (!enabled) continue;
        const upper = method.toUpperCase();
        if (
          upper === 'GET' ||
          upper === 'POST' ||
          upper === 'PUT' ||
          upper === 'PATCH' ||
          upper === 'DELETE'
        ) {
          routes.push({ method: upper, path: String(path) });
        }
      }
    }
  }

  return routes;
}

export interface ProbeRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
}

export interface ProbeResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface CrossTenantProbeOptions {
  /** Como falar com a aplicação (supertest, fetch, o que for). */
  readonly send: (request: ProbeRequest) => Promise<ProbeResponse>;
  readonly routes: readonly RegisteredRoute[];
  /** Credenciais do tenant que **tenta** acessar. */
  readonly headersOfTenantA: (audience: RouteAudience) => Record<string, string>;
  /** Ids de recursos que existem **no tenant B**, por nome de parâmetro. */
  readonly resourceIdsOfTenantB: Readonly<Record<string, string>>;
  /** Strings que jamais podem aparecer numa resposta para o tenant A. */
  readonly secretsOfTenantB: readonly string[];
  /** Corpo para métodos de escrita. */
  readonly bodyFor?: (route: RegisteredRoute) => unknown;
  readonly audiences?: readonly RouteAudience[];
}

export interface IsolationViolation {
  readonly route: string;
  readonly status: number;
  readonly reason: string;
}

/** Status que significam "não existe para você" — o resultado esperado. */
const DENIED = new Set([400, 401, 403, 404, 405, 409, 422]);

/**
 * Para cada rota com tenant, faz uma requisição como o tenant A usando ids do
 * tenant B e acusa qualquer resposta que revele dado do B.
 *
 * Uma leitura que devolve 200 com corpo vazio é aceitável (o RLS filtrou); o
 * que nunca pode acontecer é aparecer um identificador do outro tenant.
 */
export async function probeCrossTenantAccess(
  options: CrossTenantProbeOptions,
): Promise<IsolationViolation[]> {
  const audiences = options.audiences ?? TENANT_SCOPED_AUDIENCES;
  const violations: IsolationViolation[] = [];

  for (const route of options.routes) {
    const audience = audienceOf(route.path);
    if (!audiences.includes(audience)) continue;

    const { url, unresolved } = fillParams(route.path, options.resourceIdsOfTenantB);
    if (unresolved.length > 0) {
      violations.push({
        route: `${route.method} ${route.path}`,
        status: 0,
        reason:
          `a suíte não conhece id do tenant B para os parâmetros: ${unresolved.join(', ')}. ` +
          'Adicione em resourceIdsOfTenantB — rota sem cobertura é rota sem prova de isolamento.',
      });
      continue;
    }

    const response = await options.send({
      method: route.method,
      url,
      headers: options.headersOfTenantA(audience),
      ...(route.method === 'GET' || route.method === 'DELETE'
        ? {}
        : { body: options.bodyFor?.(route) ?? {} }),
    });

    const leaked = findLeak(response.body, options.secretsOfTenantB);
    if (leaked !== undefined) {
      violations.push({
        route: `${route.method} ${route.path}`,
        status: response.status,
        reason: `a resposta ao tenant A contém dado do tenant B: ${leaked}`,
      });
      continue;
    }

    // 200 com corpo vazio é o RLS funcionando; 2xx com conteúdo de outro
    // tenant já teria sido pego acima. Falta checar escrita aceita — mas só
    // faz sentido quando a rota **endereça** um recurso do tenant B (tem
    // parâmetro preenchido com id dele). Um POST de coleção cria recurso no
    // próprio tenant A e é comportamento normal, não vazamento.
    const targetsTenantB = url !== route.path;
    const isWrite = route.method !== 'GET';

    if (targetsTenantB && isWrite && response.status < 300 && !DENIED.has(response.status)) {
      violations.push({
        route: `${route.method} ${route.path}`,
        status: response.status,
        reason: 'escrita sobre recurso de outro tenant foi aceita',
      });
    }
  }

  return violations;
}

function fillParams(
  path: string,
  ids: Readonly<Record<string, string>>,
): { url: string; unresolved: string[] } {
  const unresolved: string[] = [];

  const url = path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = ids[name];
    if (value === undefined) {
      unresolved.push(name);
      return `:${name}`;
    }
    return value;
  });

  return { url, unresolved };
}

function findLeak(body: unknown, secrets: readonly string[]): string | undefined {
  if (secrets.length === 0) return undefined;

  const serialized = typeof body === 'string' ? body : JSON.stringify(body ?? null);
  return secrets.find((secret) => serialized.includes(secret));
}
