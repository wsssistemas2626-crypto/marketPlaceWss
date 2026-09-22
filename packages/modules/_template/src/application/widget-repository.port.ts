import type { Widget } from '../domain/widget.js';

/**
 * Porta de persistência do agregado. A implementação Drizzle vive em
 * `infrastructure/` — a camada de aplicação não sabe que existe SQL.
 *
 * Nenhum método recebe `tenantId`: o tenant vem do `TenantContext` e o
 * repositório o aplica (ADR-012).
 */
export interface WidgetRepositoryPort {
  save(widget: Widget): Promise<void>;
  findBySlug(slug: string): Promise<Widget | undefined>;
  list(limit: number): Promise<Widget[]>;
}

export const WIDGET_REPOSITORY = Symbol('WIDGET_REPOSITORY');
