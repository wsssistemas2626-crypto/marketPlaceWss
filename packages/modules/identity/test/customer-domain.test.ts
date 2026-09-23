import { describe, expect, it } from 'vitest';

import { FixedClock, InvariantViolationError, ValidationError } from '@mkt/shared-kernel';

import { assertStrongPassword, normalizeEmail } from '../src/domain/customer/credentials.js';
import { Customer } from '../src/domain/customer/customer.js';
import { isValidCnpj, isValidCpf, parseTaxDocument } from '../src/domain/customer/document.js';

const TENANT = '0193a000-0000-7000-8000-00000000000a';
const clock = new FixedClock(new Date('2026-09-23T12:00:00Z'));

const campoDo = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details.field as string | undefined;
  }
};

describe('CPF e CNPJ (RF-IAM-01)', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita CPF válido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['529.982.247-24', '111.111.111-11', '123', '5299822472'])('recusa CPF inválido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it('aceita CNPJ válido e recusa dígito errado', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
  });

  it('guarda só os dígitos e o tipo', () => {
    expect(parseTaxDocument('529.982.247-25')).toEqual({ type: 'cpf', number: '52998224725' });
    expect(parseTaxDocument('11.222.333/0001-81')).toEqual({ type: 'cnpj', number: '11222333000181' });
  });

  it('cenário "CPF inválido": o erro aponta o campo document e não repete o valor', () => {
    try {
      parseTaxDocument('529.982.247-24');
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationError).details).toEqual({ field: 'document' });
      expect((error as Error).message).not.toContain('529');
    }
  });
});

describe('e-mail e senha', () => {
  it('normaliza o e-mail (é a chave única por tenant)', () => {
    expect(normalizeEmail('  Ana.Silva@Exemplo.COM ')).toBe('ana.silva@exemplo.com');
    expect(campoDo(() => normalizeEmail('sem-arroba'))).toBe('email');
  });

  it.each([
    ['curta1', 'curta'],
    ['aaaaaaaaaaaa', 'um caractere só'],
    ['somenteletras', 'sem número'],
    ['1234567890', 'sem letra'],
  ])('recusa senha fraca "%s" (%s)', (senha) => {
    expect(campoDo(() => assertStrongPassword(senha))).toBe('password');
  });

  it('aceita letras + números com 10+ ou frase de 16+', () => {
    expect(() => assertStrongPassword('compras2026!')).not.toThrow();
    expect(() => assertStrongPassword('uma frase bem comprida')).not.toThrow();
  });

  it('recusa senha que contém o e-mail', () => {
    expect(campoDo(() => assertStrongPassword('mariana2026x', { email: 'mariana@x.com' }))).toBe('password');
  });
});

describe('Customer', () => {
  const registrar = (extra: Partial<Parameters<typeof Customer.register>[0]> = {}) =>
    Customer.register(
      {
        tenantId: TENANT,
        name: '  Ana   Silva ',
        email: 'Ana@Exemplo.com',
        document: '529.982.247-25',
        passwordHash: '$argon2id$hash',
        acceptedVersions: { terms_of_use: '2026-09', privacy_policy: '2026-08' },
        ip: '200.1.2.3',
        ...extra,
      },
      clock,
    );

  it('cenário "cadastro válido": nasce pending_verification com o aceite registrado (RNF-LGPD-03)', () => {
    const cliente = registrar();
    const snapshot = cliente.toSnapshot();

    expect(snapshot.status).toBe('pending_verification');
    expect(snapshot.name).toBe('Ana Silva');
    expect(snapshot.email).toBe('ana@exemplo.com');
    expect(snapshot.consents).toEqual([
      { kind: 'terms_of_use', version: '2026-09', acceptedAt: clock.now(), ip: '200.1.2.3' },
      { kind: 'privacy_policy', version: '2026-08', acceptedAt: clock.now(), ip: '200.1.2.3' },
    ]);
  });

  it('nome curto demais é erro do campo name', () => {
    expect(campoDo(() => registrar({ name: 'A' }))).toBe('name');
  });

  it('confirmar o e-mail ativa a conta; repetir não é erro', () => {
    const cliente = registrar();

    expect(cliente.verifyEmail(clock)).toBe('verified');
    expect(cliente.status).toBe('active');
    expect(cliente.toSnapshot().emailVerifiedAt).toEqual(clock.now());
    expect(cliente.verifyEmail(clock)).toBe('already_verified');
  });

  it('transição inválida é erro de invariante (máquina de estados explícita)', () => {
    const anonimizada = Customer.restore({ ...registrar().toSnapshot(), status: 'anonymized' });

    expect(() => anonimizada.verifyEmail(clock)).toThrow(InvariantViolationError);
  });
});
