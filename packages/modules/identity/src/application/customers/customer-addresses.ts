import type { PostalCodeAddress, PostalCodePort } from '@mkt/contracts';
import { type Clock, DomainError, Id, InvariantViolationError, NotFoundError } from '@mkt/shared-kernel';

import {
  MAX_ADDRESSES_PER_CUSTOMER,
  newAddress,
  parseAddressFields,
  type AddressInput,
  type AddressSnapshot,
} from '../../domain/customer/address.js';

/**
 * Endereços do comprador. Toda operação recebe o `customerId` da sessão —
 * nunca do corpo —, e o repositório filtra por ele (e pelo tenant, via RLS):
 * id de endereço de outro comprador simplesmente não existe (anti-IDOR).
 */
export interface CustomerAddressRepositoryPort {
  list(customerId: string): Promise<AddressSnapshot[]>;
  find(customerId: string, addressId: string): Promise<AddressSnapshot | undefined>;
  /** Grava o endereço; `isDefault` verdadeiro desmarca os outros na mesma transação. */
  save(address: AddressSnapshot): Promise<void>;
  remove(customerId: string, addressId: string): Promise<void>;
}

export const CUSTOMER_ADDRESS_REPOSITORY = Symbol('CUSTOMER_ADDRESS_REPOSITORY');
export const POSTAL_CODE = Symbol('POSTAL_CODE');

export class PostalCodeUnavailableError extends DomainError {
  readonly httpStatus = 503;

  constructor() {
    super('postal_code_unavailable', 'Não conseguimos consultar o CEP agora. Preencha o endereço à mão.', {});
  }
}

const notFound = () => new NotFoundError('Endereço');

/** RF-IAM-09 / US-014. */
export class CustomerAddresses {
  constructor(
    private readonly addresses: CustomerAddressRepositoryPort,
    private readonly postalCodes: PostalCodePort,
    private readonly clock: Clock,
  ) {}

  /** Mais recente primeiro, com o padrão no topo. */
  async list(customerId: string): Promise<AddressSnapshot[]> {
    const all = await this.addresses.list(customerId);
    return [...all].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /** O primeiro endereço vira o padrão; os seguintes, só se pedido. */
  async add(customerId: string, input: AddressInput): Promise<AddressSnapshot> {
    const fields = parseAddressFields(input);
    const existing = await this.addresses.list(customerId);
    if (existing.length >= MAX_ADDRESSES_PER_CUSTOMER) {
      throw new InvariantViolationError(`Limite de ${MAX_ADDRESSES_PER_CUSTOMER} endereços por conta`, {
        field: 'addresses',
      });
    }

    const address = newAddress(
      customerId,
      fields,
      existing.length === 0 || input.isDefault === true,
      this.clock,
    );
    await this.addresses.save(address);
    return address;
  }

  async update(customerId: string, addressId: string, input: AddressInput): Promise<AddressSnapshot> {
    const current = await this.find(customerId, addressId);
    const fields = parseAddressFields(input);
    const updated: AddressSnapshot = {
      ...fields,
      id: current.id,
      customerId,
      // desmarcar o padrão direto não existe: marca-se outro como padrão
      isDefault: current.isDefault || input.isDefault === true,
      createdAt: current.createdAt,
      updatedAt: this.clock.now(),
    };
    await this.addresses.save(updated);
    return updated;
  }

  /** Remover o padrão promove o mais recente dos que sobram. */
  async remove(customerId: string, addressId: string): Promise<void> {
    const current = await this.find(customerId, addressId);
    await this.addresses.remove(customerId, addressId);

    if (current.isDefault) {
      const [next] = await this.list(customerId);
      if (next !== undefined)
        await this.addresses.save({ ...next, isDefault: true, updatedAt: this.clock.now() });
    }
  }

  /** Id malformado é "não existe" (404), não erro do banco (500). */
  private async find(customerId: string, addressId: string): Promise<AddressSnapshot> {
    const current = Id.isValid(addressId) ? await this.addresses.find(customerId, addressId) : undefined;
    if (current === undefined) throw notFound();
    return current;
  }

  /** Autocompletar do CEP: `undefined` = CEP não existe; serviço fora = 503 com preenchimento manual. */
  async lookupPostalCode(zipCode: string): Promise<PostalCodeAddress | undefined> {
    const digits = zipCode.replace(/\D/g, '');
    if (digits.length !== 8) return undefined;

    try {
      return await this.postalCodes.lookup(digits);
    } catch {
      throw new PostalCodeUnavailableError();
    }
  }
}
