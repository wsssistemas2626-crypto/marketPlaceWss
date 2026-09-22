import { describe, expect, it } from 'vitest';

import { FixedClock, Id, Money, ValidationError } from '@mkt/shared-kernel';

import { CreateWidget } from '../src/application/create-widget.js';
import type { EventPublisherPort, TransactionPort } from '../src/application/ports.js';
import type { WidgetRepositoryPort } from '../src/application/widget-repository.port.js';
import { ListWidgets } from '../src/application/list-widgets.js';
import { Widget } from '../src/domain/widget.js';

const clock = new FixedClock('2026-04-01T09:00:00.000Z');
const TENANT = '0193a000-0000-7000-8000-00000000000a';

const novoWidget = (slug = 'widget-um') =>
  Widget.create({ tenantId: TENANT, slug, name: 'Widget Um', price: Money.fromCents(1990) }, clock);

/** Sem banco: roda o trabalho direto, como uma transação que sempre commita. */
const transacaoDireta: TransactionPort = { run: (work) => work() };

class PublicadorEmMemoria implements EventPublisherPort {
  readonly eventos: { type: string; tenantId: string }[] = [];

  async publish(event: { type: string; tenantId: string }): Promise<void> {
    this.eventos.push({ type: event.type, tenantId: event.tenantId });
  }
}

class RepositorioEmMemoria implements WidgetRepositoryPort {
  readonly salvos: Widget[] = [];

  async save(widget: Widget): Promise<void> {
    this.salvos.push(widget);
  }

  async findBySlug(slug: string): Promise<Widget | undefined> {
    return this.salvos.find((widget) => widget.slug === slug);
  }

  async list(limit: number): Promise<Widget[]> {
    return this.salvos.slice(0, limit);
  }
}

describe('Widget (domínio)', () => {
  it('nasce com id v7, tenant e horário do Clock', () => {
    const widget = novoWidget();

    expect(Id.isValid(widget.id)).toBe(true);
    expect(widget.tenantId).toBe(TENANT);
    expect(widget.toSnapshot().createdAt.toISOString()).toBe('2026-04-01T09:00:00.000Z');
    expect(widget.price.cents).toBe(1990);
  });

  it('recusa slug fora do padrão', () => {
    for (const slug of ['Widget Um', 'widget_um', '-widget', 'widget-', '']) {
      expect(() => novoWidget(slug), slug).toThrow(ValidationError);
    }
  });

  it('recusa nome vazio ou longo demais', () => {
    expect(() =>
      Widget.create({ tenantId: TENANT, slug: 'ok', name: '   ', price: Money.zero() }, clock),
    ).toThrow(ValidationError);
    expect(() =>
      Widget.create({ tenantId: TENANT, slug: 'ok', name: 'x'.repeat(121), price: Money.zero() }, clock),
    ).toThrow(ValidationError);
  });

  it('recusa preço negativo na criação e na alteração', () => {
    expect(() =>
      Widget.create({ tenantId: TENANT, slug: 'ok', name: 'Ok', price: Money.fromCents(-1) }, clock),
    ).toThrow(ValidationError);
    expect(() => novoWidget().changePrice(Money.fromCents(-1), clock)).toThrow(ValidationError);
  });

  it('recusa tenant que não é UUID v7', () => {
    expect(() =>
      Widget.create({ tenantId: 'loja-a', slug: 'ok', name: 'Ok', price: Money.zero() }, clock),
    ).toThrow(ValidationError);
  });

  it('renomeia e reprecifica atualizando updatedAt', () => {
    const widget = novoWidget();
    const relogio = new FixedClock('2026-04-02T09:00:00.000Z');

    widget.rename('  Novo nome  ', relogio);
    widget.changePrice(Money.fromCents(2990), relogio);

    expect(widget.name).toBe('Novo nome');
    expect(widget.price.cents).toBe(2990);
    expect(widget.toSnapshot().updatedAt.toISOString()).toBe('2026-04-02T09:00:00.000Z');
  });

  it('restore reconstrói sem revalidar (vem do banco)', () => {
    const snapshot = novoWidget().toSnapshot();

    expect(Widget.restore(snapshot).slug).toBe('widget-um');
  });
});

describe('CreateWidget (aplicação)', () => {
  it('cria, persiste e publica o evento na mesma transação', async () => {
    const repositorio = new RepositorioEmMemoria();
    const publicador = new PublicadorEmMemoria();
    const resultado = await new CreateWidget(repositorio, transacaoDireta, publicador, clock).execute({
      tenantId: TENANT,
      slug: 'widget-um',
      name: 'Widget Um',
      priceCents: 1990,
    });

    expect(resultado.ok).toBe(true);
    expect(repositorio.salvos).toHaveLength(1);
    expect(publicador.eventos).toEqual([{ type: 'template.widget.created', tenantId: TENANT }]);
  });

  it('devolve erro de conflito quando o slug já existe no tenant', async () => {
    const repositorio = new RepositorioEmMemoria();
    const publicador = new PublicadorEmMemoria();
    await repositorio.save(novoWidget());

    const resultado = await new CreateWidget(repositorio, transacaoDireta, publicador, clock).execute({
      tenantId: TENANT,
      slug: 'widget-um',
      name: 'Outro',
      priceCents: 100,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('conflict');
    }
    // conflito não publica evento
    expect(publicador.eventos).toEqual([]);
  });
});

describe('ListWidgets (aplicação)', () => {
  it('limita o tamanho da página', async () => {
    const repositorio = new RepositorioEmMemoria();
    for (let indice = 0; indice < 5; indice += 1) {
      await repositorio.save(novoWidget(`widget-${indice}`));
    }

    expect(await new ListWidgets(repositorio).execute(2)).toHaveLength(2);
    expect(await new ListWidgets(repositorio).execute(0)).toHaveLength(1);
    expect(await new ListWidgets(repositorio).execute(1000)).toHaveLength(5);
    expect(await new ListWidgets(repositorio).execute()).toHaveLength(5);
  });
});
