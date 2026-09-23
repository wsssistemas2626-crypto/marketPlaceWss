import { ValidationError } from '@mkt/shared-kernel';

/**
 * E-mail normalizado: sem espaços e em minúsculas. É a chave de unicidade
 * **por tenant** (`UNIQUE(tenant_id, email)`, ADR-013) — o mesmo e-mail pode
 * ter conta em outro marketplace.
 */
export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();

  // validação estrutural simples: a confirmação por link é quem prova o e-mail
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('E-mail inválido', { field: 'email' });
  }

  return email;
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Política de senha do comprador (RNF-SEG-02: "senha forte").
 *
 * Comprimento pesa mais que regra de composição (NIST 800-63B): mínimo de 10
 * caracteres com letra e número, ou uma frase de 16+. O teto evita que um hash
 * Argon2 de entrada gigante vire negação de serviço. Senha vazada é checada à
 * parte, na aplicação (`PasswordBreachPort`), porque exige I/O.
 */
export function assertStrongPassword(password: string, context: { email?: string } = {}): void {
  const fail = (reason: string): never => {
    throw new ValidationError(reason, { field: 'password' });
  };

  if (password.length < PASSWORD_MIN_LENGTH)
    fail(`A senha precisa de pelo menos ${PASSWORD_MIN_LENGTH} caracteres`);
  if (password.length > PASSWORD_MAX_LENGTH)
    fail(`A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres`);
  if (/^(.)\1+$/.test(password)) fail('A senha não pode repetir um único caractere');

  const isPassphrase = password.length >= 16;
  if (!isPassphrase && !(/\p{L}/u.test(password) && /\d/.test(password))) {
    fail('Use letras e números, ou uma frase com 16 caracteres ou mais');
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart !== undefined && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    fail('A senha não pode conter o seu e-mail');
  }
}
