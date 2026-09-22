import { ValidationError } from '@mkt/shared-kernel';

/**
 * Slugs que não podem virar tenant (RN-TEN-01).
 *
 * Dois motivos: alguns já são subdomínios nossos (`api`, `admin`, `console`,
 * `vendedor`) e entregá-los a um tenant sequestraria o painel; outros são
 * convenções que confundiriam quem lê a URL (`www`, `mail`, `static`).
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'app',
  'assets',
  'blog',
  'cdn',
  'checkout',
  'console',
  'dashboard',
  'dev',
  'docs',
  'ftp',
  'help',
  'mail',
  'marketplace',
  'painel',
  'plataforma',
  'seller',
  'sellercenter',
  'staging',
  'static',
  'status',
  'store',
  'support',
  'suporte',
  'test',
  'vendedor',
  'webmail',
  'www',
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

/**
 * Valida o slug do tenant (RN-TEN-01): 3–30 caracteres `[a-z0-9-]`, único na
 * plataforma e **imutável depois da ativação** — ele vira subdomínio, e mudar
 * quebraria links, e-mails enviados e integrações já configuradas.
 */
export function assertValidTenantSlug(slug: string): string {
  if (slug.length < MIN_LENGTH || slug.length > MAX_LENGTH) {
    throw new ValidationError(`Slug deve ter entre ${MIN_LENGTH} e ${MAX_LENGTH} caracteres`, {
      field: 'slug',
      min: MIN_LENGTH,
      max: MAX_LENGTH,
    });
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      'Slug deve conter apenas letras minúsculas, dígitos e hífens (sem hífen no começo ou no fim)',
      { field: 'slug' },
    );
  }

  if (RESERVED_SLUGS.includes(slug)) {
    throw new ValidationError(`O slug "${slug}" é reservado pela plataforma`, { field: 'slug', slug });
  }

  return slug;
}

export const isReservedSlug = (slug: string): boolean => RESERVED_SLUGS.includes(slug);
