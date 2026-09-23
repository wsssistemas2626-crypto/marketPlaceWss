import { describe, expect, it } from 'vitest';

import {
  Argon2idPasswordHasher,
  createSecretToken,
  hashSecretToken,
} from '../src/security/password-hasher.js';

// parâmetros baixos só no teste: o custo real (19 MiB, t=2) é o padrão da classe
const hasher = new Argon2idPasswordHasher({ memoryKiB: 1024, passes: 1, parallelism: 1 });

describe('Argon2idPasswordHasher (RNF-SEG-02)', () => {
  it('gera hash Argon2id no formato PHC, com sal aleatório', async () => {
    const primeiro = await hasher.hash('compras2026!');
    const segundo = await hasher.hash('compras2026!');

    expect(primeiro).toMatch(/^\$argon2id\$v=19\$m=1024,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(primeiro).not.toBe(segundo);
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hasher.hash('compras2026!');

    await expect(hasher.verify(hash, 'compras2026!')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'compras2026?')).resolves.toBe(false);
  });

  it('hash malformado não é aceito (nem lança)', async () => {
    await expect(hasher.verify('$2b$10$bcrypt-antigo', 'qualquer')).resolves.toBe(false);
  });

  it('pede rehash quando os parâmetros atuais são mais fortes', async () => {
    const fraco = await hasher.hash('compras2026!');

    expect(new Argon2idPasswordHasher().needsRehash(fraco)).toBe(true);
    expect(hasher.needsRehash(fraco)).toBe(false);
  });
});

describe('token secreto de uso único', () => {
  it('o banco guarda o SHA-256; o token não é derivável do hash', () => {
    const { token, hash } = createSecretToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashSecretToken(token));
    expect(hash).not.toContain(token);
    expect(createSecretToken().token).not.toBe(token);
  });
});
