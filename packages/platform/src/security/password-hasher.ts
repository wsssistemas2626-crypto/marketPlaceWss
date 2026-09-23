import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Hash de senha com **Argon2id** (RNF-SEG-02 / ADR-009), usando o Argon2
 * nativo do Node (≥ 24.7) — sem dependência nativa extra para compilar no
 * Windows nem na imagem da Railway.
 *
 * Parâmetros do OWASP Password Storage Cheat Sheet: 19 MiB, 2 passadas,
 * paralelismo 1. O resultado vai no formato PHC
 * (`$argon2id$v=19$m=…,t=…,p=…$sal$hash`), que carrega os parâmetros — dá para
 * endurecê-los depois e rehashear no login (`needsRehash`).
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encoded: string, password: string): Promise<boolean>;
  needsRehash(encoded: string): boolean;
}

interface Argon2Parameters {
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
}

export const ARGON2ID_DEFAULTS: Argon2Parameters = { memoryKiB: 19_456, passes: 2, parallelism: 1 };

const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const b64 = (buffer: Buffer): string => buffer.toString('base64').replace(/=+$/, '');

function derive(
  password: string,
  salt: Buffer,
  parameters: Argon2Parameters,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        memory: parameters.memoryKiB,
        passes: parameters.passes,
        parallelism: parameters.parallelism,
        tagLength,
      },
      (error, derived) => (error === null ? resolve(Buffer.from(derived)) : reject(error)),
    );
  });
}

export class Argon2idPasswordHasher implements PasswordHasher {
  constructor(private readonly parameters: Argon2Parameters = ARGON2ID_DEFAULTS) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const tag = await derive(password, salt, this.parameters, TAG_LENGTH);
    const { memoryKiB, passes, parallelism } = this.parameters;

    return `$argon2id$v=19$m=${memoryKiB},t=${passes},p=${parallelism}$${b64(salt)}$${b64(tag)}`;
  }

  async verify(encoded: string, password: string): Promise<boolean> {
    const match = PHC.exec(encoded);
    if (match === null) return false;

    const [, memory, passes, parallelism, salt, expected] = match;
    const expectedTag = Buffer.from(expected ?? '', 'base64');
    const tag = await derive(
      password,
      Buffer.from(salt ?? '', 'base64'),
      { memoryKiB: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
      expectedTag.length,
    );

    return tag.length === expectedTag.length && timingSafeEqual(tag, expectedTag);
  }

  needsRehash(encoded: string): boolean {
    const match = PHC.exec(encoded);
    if (match === null) return true;

    const { memoryKiB, passes, parallelism } = this.parameters;
    return Number(match[1]) < memoryKiB || Number(match[2]) < passes || Number(match[3]) !== parallelism;
  }
}

/**
 * Token secreto de uso único (confirmação de e-mail, troca de senha, refresh).
 *
 * O **token** vai para o usuário (link, cookie); o banco guarda só o
 * **SHA-256** dele. Vazou a tabela, os links continuam inúteis. Não precisa de
 * sal nem de hash lento: são 256 bits aleatórios, não uma senha escolhida.
 */
export interface SecretToken {
  readonly token: string;
  readonly hash: string;
}

export function createSecretToken(): SecretToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSecretToken(token) };
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
