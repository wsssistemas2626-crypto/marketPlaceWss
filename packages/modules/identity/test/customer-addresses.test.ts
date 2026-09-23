import { beforeEach, describe, expect, it } from 'vitest';

import { FakePostalCode } from '@mkt/adapters-fakes';
import type { PostalCodePort } from '@mkt/contracts';
import { FixedClock, Id, NotFoundError, ValidationError } from '@mkt/shared-kernel';

import {
  CustomerAddresses,
  PostalCodeUnavailableError,
  type CustomerAddressRepositoryPort,
} from '../src/application/customers/customer-addresses.js';
import {
  MAX_ADDRESSES_PER_CUSTOMER,
  parseAddressFields,
  type AddressSnapshot,
} from '../src/domain/customer/address.js';

class EnderecosEmMemoria implements CustomerAddressRepositoryPort {
  readonly todos = new Map<string, AddressSnapshot>();

  async list(customerId: string) {
    return [...this.todos.values()].filter((endereco) => endereco.customerId === customerId);
  }

  async find(customerId: string, addressId: string) {
    const endereco = this.todos.get(addressId);
    return endereco?.customerId === customerId ? endereco : undefined;
  }

  async save(address: AddressSnapshot) {
    if (address.isDefault) {
      for (const [id, outro] of this.todos) {
        if (outro.customerId === address.customerId && id !== address.id) {
          this.todos.set(id, { ...outro, isDefault: false });
        }
      }
    }
    this.todos.set(address.id, address);
  }

  async remove(customerId: string, addressId: string) {
    if (this.todos.get(addressId)?.customerId === customerId) this.todos.delete(addressId);
  }
}

const ANA = '0193a000-0000-7000-8000-0000000000a1';
const BIA = '0193a000-0000-7000-8000-0000000000b1';

const endereco = (extra: Record<string, string | boolean | undefined> = {}) => ({
  recipientName: 'Ana Silva',
  zipCode: '01001-000',
  street: 'Praça da Sé',
  number: '100',
  district: 'Sé',
  city: 'São Paulo',
  state: 'sp',
  ...extra,
});

const campoDo = async (promessa: Promise<unknown>): Promise<unknown> =>
  promessa.then(
    () => undefined,
    (error: unknown) => (error instanceof ValidationError ? error.details.field : error),
  );

describe('endereço — validação (RF-IAM-09)', () => {
  it('normaliza CEP e UF e aceita "S/N" como número', () => {
    const campos = parseAddressFields(endereco({ number: 'S/N', complement: '  apto 12 ' }));

    expect(campos).toMatchObject({ zipCode: '01001000', state: 'SP', number: 'S/N', complement: 'apto 12' });
  });

  it.each([
    ['zipCode', { zipCode: '0100100' }],
    ['state', { state: 'XX' }],
    ['street', { street: '   ' }],
    ['recipientName', { recipientName: '' }],
  ])('recusa %s inválido', (campo, extra) => {
    expect(() => parseAddressFields(endereco(extra))).toThrow(
      expect.objectContaining({ details: { field: campo } }) as unknown as Error,
    );
  });
});

describe('CustomerAddresses (US-014)', () => {
  let repositorio: EnderecosEmMemoria;
  let clock: FixedClock;
  let enderecos: CustomerAddresses;

  beforeEach(() => {
    repositorio = new EnderecosEmMemoria();
    clock = new FixedClock('2026-09-23T12:00:00Z');
    enderecos = new CustomerAddresses(repositorio, new FakePostalCode(), clock);
  });

  it('o primeiro endereço vira o padrão; o segundo, só se pedir', async () => {
    const primeiro = await enderecos.add(ANA, endereco());
    clock.advance(1_000);
    const segundo = await enderecos.add(ANA, endereco({ label: 'Trabalho' }));

    expect(primeiro.isDefault).toBe(true);
    expect(segundo.isDefault).toBe(false);
  });

  it('marcar outro como padrão desmarca o anterior (um padrão por comprador)', async () => {
    const casa = await enderecos.add(ANA, endereco());
    const trabalho = await enderecos.add(ANA, endereco({ label: 'Trabalho', isDefault: true }));

    const lista = await enderecos.list(ANA);

    expect(lista.map((item) => [item.id, item.isDefault])).toEqual([
      [trabalho.id, true],
      [casa.id, false],
    ]);
  });

  it('remover o padrão promove o mais recente dos que sobram', async () => {
    const casa = await enderecos.add(ANA, endereco());
    clock.advance(1_000);
    await enderecos.add(ANA, endereco({ label: 'Antigo' }));
    clock.advance(1_000);
    const recente = await enderecos.add(ANA, endereco({ label: 'Recente' }));

    await enderecos.remove(ANA, casa.id);

    expect((await enderecos.list(ANA))[0]).toMatchObject({ id: recente.id, isDefault: true });
  });

  it('editar mantém o padrão; não dá para ficar sem padrão desmarcando', async () => {
    const casa = await enderecos.add(ANA, endereco());

    const editado = await enderecos.update(ANA, casa.id, endereco({ number: '200', isDefault: false }));

    expect(editado).toMatchObject({ number: '200', isDefault: true });
  });

  it(`limite de ${MAX_ADDRESSES_PER_CUSTOMER} endereços por conta`, async () => {
    for (let vez = 0; vez < MAX_ADDRESSES_PER_CUSTOMER; vez += 1) await enderecos.add(ANA, endereco());

    await expect(enderecos.add(ANA, endereco())).rejects.toThrow(/Limite/);
  });

  it('anti-IDOR: endereço de outro comprador "não existe" para editar ou remover', async () => {
    const daBia = await enderecos.add(BIA, endereco({ recipientName: 'Bia' }));

    await expect(enderecos.update(ANA, daBia.id, endereco())).rejects.toBeInstanceOf(NotFoundError);
    await expect(enderecos.remove(ANA, daBia.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(repositorio.todos.get(daBia.id)?.recipientName).toBe('Bia');
  });

  it('id malformado é 404, não erro de banco', async () => {
    await expect(enderecos.remove(ANA, 'nao-e-uuid')).rejects.toBeInstanceOf(NotFoundError);
    await expect(enderecos.remove(ANA, Id.create(clock))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('campo inválido aponta o campo', async () => {
    expect(await campoDo(enderecos.add(ANA, endereco({ zipCode: '123' })))).toBe('zipCode');
  });

  describe('CEP', () => {
    it('autocompleta CEP conhecido e devolve undefined para inexistente', async () => {
      await expect(enderecos.lookupPostalCode('01001-000')).resolves.toMatchObject({
        city: 'São Paulo',
        state: 'SP',
      });
      await expect(enderecos.lookupPostalCode('99999999')).resolves.toBeUndefined();
      await expect(enderecos.lookupPostalCode('123')).resolves.toBeUndefined();
    });

    it('serviço de CEP fora vira 503 com preenchimento manual, não 500', async () => {
      const foraDoAr: PostalCodePort = {
        lookup: async () => {
          throw new Error('timeout');
        },
      };
      const semCep = new CustomerAddresses(repositorio, foraDoAr, clock);

      const erro = await semCep.lookupPostalCode('01001000').catch((error: unknown) => error);

      expect(erro).toBeInstanceOf(PostalCodeUnavailableError);
      expect((erro as PostalCodeUnavailableError).httpStatus).toBe(503);
    });
  });
});
