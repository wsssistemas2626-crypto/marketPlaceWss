import { generateKeyPairSync, createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FixedClock } from '@mkt/shared-kernel';

import { Ed25519JwtSigner, Ed25519JwtVerifier, generateEd25519KeyPair } from '../src/security/jwt.js';

const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
const esperado = { issuer: 'mkt-identity', audience: 'storefront' };

const par = () => {
  const clock = new FixedClock('2026-09-23T12:00:00Z');
  return {
    clock,
    signer: new Ed25519JwtSigner(privateKeyPem, clock),
    verifier: new Ed25519JwtVerifier(publicKeyPem, esperado, clock),
  };
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JWT Ed25519', () => {
  it('assina e verifica as claims', () => {
    const { signer, verifier } = par();
    const { token, expiresAt } = signer.sign(
      { sub: 'cliente-1', iss: 'mkt-identity', aud: 'storefront', tid: 't1' },
      900,
    );

    const claims = verifier.verify(token);

    expect(claims).toMatchObject({ sub: 'cliente-1', tid: 't1' });
    expect(expiresAt.toISOString()).toBe('2026-09-23T12:15:00.000Z');
  });

  it('recusa token expirado', () => {
    const { signer, verifier, clock } = par();
    const { token } = signer.sign({ sub: 'c', iss: 'mkt-identity', aud: 'storefront' }, 900);
    clock.advance(900_000);

    expect(() => verifier.verify(token)).toThrow(/expirado/);
  });

  it('recusa emissor ou audiência diferentes', () => {
    const { signer, verifier } = par();

    expect(() =>
      verifier.verify(signer.sign({ sub: 'c', iss: 'outro', aud: 'storefront' }, 60).token),
    ).toThrow(/emissor/);
    expect(() =>
      verifier.verify(signer.sign({ sub: 'c', iss: 'mkt-identity', aud: 'painel' }, 60).token),
    ).toThrow(/audiência/);
  });

  it('recusa payload adulterado', () => {
    const { signer, verifier } = par();
    const [header, , assinatura] = signer
      .sign({ sub: 'c', iss: 'mkt-identity', aud: 'storefront', tid: 'a' }, 60)
      .token.split('.');
    const adulterado = `${header}.${b64({ sub: 'c', iss: 'mkt-identity', aud: 'storefront', tid: 'b', iat: 1, exp: 9e9 })}.${assinatura}`;

    expect(() => verifier.verify(adulterado)).toThrow(/assinatura/);
  });

  it('recusa alg none e HS256 (confusão de algoritmo)', () => {
    const { verifier } = par();
    const payload = b64({ sub: 'c', iss: 'mkt-identity', aud: 'storefront', iat: 1, exp: 9e9 });

    expect(() => verifier.verify(`${b64({ alg: 'none' })}.${payload}.`)).toThrow(/algoritmo/);

    const cabecalho = b64({ alg: 'HS256', typ: 'JWT' });
    const hmac = createHmac('sha256', publicKeyPem).update(`${cabecalho}.${payload}`).digest('base64url');
    expect(() => verifier.verify(`${cabecalho}.${payload}.${hmac}`)).toThrow(/algoritmo/);
  });

  it('token assinado por outra chave não passa', () => {
    const { verifier, clock } = par();
    const outra = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const { token } = new Ed25519JwtSigner(outra, clock).sign(
      { sub: 'c', iss: 'mkt-identity', aud: 'storefront' },
      60,
    );

    expect(() => verifier.verify(token)).toThrow(/assinatura/);
  });
});
