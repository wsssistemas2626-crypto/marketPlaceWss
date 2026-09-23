import { type Clock, Id, ValidationError } from '@mkt/shared-kernel';

/** Unidades federativas — endereço de entrega só no Brasil nesta fase. */
// prettier-ignore
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** Endereços por comprador — bastante para casa, trabalho e presentes, sem virar depósito. */
export const MAX_ADDRESSES_PER_CUSTOMER = 20;

export interface AddressFields {
  /** Apelido opcional ("Casa", "Trabalho"). */
  readonly label?: string;
  /** Quem recebe. Dado pessoal. */
  readonly recipientName: string;
  /** Só dígitos. */
  readonly zipCode: string;
  /** Dado pessoal. */
  readonly street: string;
  readonly number: string;
  readonly complement?: string;
  readonly district: string;
  readonly city: string;
  readonly state: string;
}

/** O que chega do comprador, antes de validar: todo campo pode faltar. */
export type AddressInput = { readonly [K in keyof AddressFields]?: string | undefined } & {
  readonly isDefault?: boolean | undefined;
};

export interface AddressSnapshot extends AddressFields {
  readonly id: string;
  readonly customerId: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const text = (value: string | undefined, field: string, max: number, required = true): string | undefined => {
  const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (cleaned === '') {
    if (required) throw new ValidationError('Campo obrigatório', { field });
    return undefined;
  }
  if (cleaned.length > max) throw new ValidationError(`Use até ${max} caracteres`, { field });
  return cleaned;
};

/** Valida e normaliza os campos de um endereço (RF-IAM-09). */
export function parseAddressFields(input: AddressInput): AddressFields {
  const zipCode = (input.zipCode ?? '').replace(/\D/g, '');
  if (zipCode.length !== 8) throw new ValidationError('CEP precisa de 8 dígitos', { field: 'zipCode' });

  const state = (input.state ?? '').trim().toUpperCase();
  if (!(BRAZILIAN_STATES as readonly string[]).includes(state)) {
    throw new ValidationError('UF inválida', { field: 'state' });
  }

  const label = text(input.label, 'label', 40, false);
  const complement = text(input.complement, 'complement', 80, false);

  return {
    ...(label === undefined ? {} : { label }),
    recipientName: text(input.recipientName, 'recipientName', 120) as string,
    zipCode,
    street: text(input.street, 'street', 160) as string,
    // "S/N" é número válido
    number: text(input.number, 'number', 20) as string,
    ...(complement === undefined ? {} : { complement }),
    district: text(input.district, 'district', 80) as string,
    city: text(input.city, 'city', 80) as string,
    state,
  };
}

export function newAddress(
  customerId: string,
  fields: AddressFields,
  isDefault: boolean,
  clock: Clock,
): AddressSnapshot {
  const now = clock.now();
  return { ...fields, id: Id.create(clock), customerId, isDefault, createdAt: now, updatedAt: now };
}
