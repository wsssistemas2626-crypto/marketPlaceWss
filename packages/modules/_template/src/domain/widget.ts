import { type Clock, Id, Money, ValidationError } from '@mkt/shared-kernel';

/**
 * Agregado de exemplo. Existe para provar o fluxo completo da arquitetura
 * (HTTP → caso de uso → repositório → outbox → worker → consumidor) sempre no
 * tenant correto — não é um conceito de negócio.
 *
 * Repare no que esta camada **não** tem: Nest, Drizzle, SQL, I/O. Só regra.
 */
export interface WidgetSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly price: Money;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 120;

export class Widget {
  private constructor(private snapshot: WidgetSnapshot) {}

  static create(input: { tenantId: string; slug: string; name: string; price: Money }, clock: Clock): Widget {
    const slug = Widget.assertSlug(input.slug);
    const name = Widget.assertName(input.name);
    if (input.price.isNegative()) {
      throw new ValidationError('Preço não pode ser negativo', { field: 'price' });
    }

    const now = clock.now();
    return new Widget({
      id: Id.create(clock),
      tenantId: Id.parse(input.tenantId, 'tenantId'),
      slug,
      name,
      price: input.price,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói a partir do repositório, sem reexecutar as regras de criação. */
  static restore(snapshot: WidgetSnapshot): Widget {
    return new Widget(snapshot);
  }

  private static assertSlug(slug: string): string {
    if (!SLUG_PATTERN.test(slug)) {
      throw new ValidationError(`Slug deve conter apenas minúsculas, dígitos e hífens: "${slug}"`, {
        field: 'slug',
      });
    }
    return slug;
  }

  private static assertName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Nome é obrigatório', { field: 'name' });
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`, {
        field: 'name',
        max: MAX_NAME_LENGTH,
      });
    }
    return trimmed;
  }

  rename(name: string, clock: Clock): void {
    this.snapshot = { ...this.snapshot, name: Widget.assertName(name), updatedAt: clock.now() };
  }

  changePrice(price: Money, clock: Clock): void {
    if (price.isNegative()) {
      throw new ValidationError('Preço não pode ser negativo', { field: 'price' });
    }
    this.snapshot = { ...this.snapshot, price, updatedAt: clock.now() };
  }

  get id(): string {
    return this.snapshot.id;
  }

  get tenantId(): string {
    return this.snapshot.tenantId;
  }

  get slug(): string {
    return this.snapshot.slug;
  }

  get name(): string {
    return this.snapshot.name;
  }

  get price(): Money {
    return this.snapshot.price;
  }

  toSnapshot(): WidgetSnapshot {
    return this.snapshot;
  }
}
