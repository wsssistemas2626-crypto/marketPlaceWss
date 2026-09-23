import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import type { Clock } from '@mkt/shared-kernel';

/**
 * JWT assinado com **Ed25519** (`alg: EdDSA`), com o `node:crypto` — sem
 * biblioteca: o formato é pequeno, e a parte perigosa de JWT (aceitar o `alg`
 * que o token diz, `none`, confusão HS/RS) some quando o algoritmo é fixo e o
 * verificador só conhece uma chave pública.
 *
 * Usado pelos compradores (ADR-009/ADR-013): access token curto, com `tid`
 * conferido contra o tenant do host a cada requisição.
 */
export interface JwtClaims {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string;
  /** Segundos desde a época. */
  readonly iat: number;
  readonly exp: number;
  readonly [claim: string]: unknown;
}

export class InvalidJwtError extends Error {
  constructor(reason: string) {
    super(`Token inválido: ${reason}`);
  }
}

const HEADER = { alg: 'EdDSA', typ: 'JWT' } as const;

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const decode = (segment: string): unknown => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidJwtError('segmento malformado');
  }
};

export class Ed25519JwtSigner {
  private readonly privateKey: KeyObject;

  constructor(
    privateKeyPem: string,
    private readonly clock: Clock,
  ) {
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== 'ed25519')
      throw new Error('A chave privada precisa ser Ed25519');
  }

  sign(claims: Omit<JwtClaims, 'iat' | 'exp'>, ttlSeconds: number): { token: string; expiresAt: Date } {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + ttlSeconds;
    const input = `${encode(HEADER)}.${encode({ ...claims, iat, exp })}`;
    const signature = sign(null, Buffer.from(input, 'utf8'), this.privateKey).toString('base64url');

    return { token: `${input}.${signature}`, expiresAt: new Date(exp * 1000) };
  }
}

export class Ed25519JwtVerifier {
  private readonly publicKey: KeyObject;

  constructor(
    publicKeyPem: string,
    private readonly expected: { issuer: string; audience: string },
    private readonly clock: Clock,
  ) {
    this.publicKey = createPublicKey(publicKeyPem);
    if (this.publicKey.asymmetricKeyType !== 'ed25519')
      throw new Error('A chave pública precisa ser Ed25519');
  }

  verify(token: string): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new InvalidJwtError('formato');
    const [header, payload, signature] = parts as [string, string, string];

    const parsedHeader = decode(header) as { alg?: unknown; typ?: unknown };
    // o algoritmo é nosso, não do token: `none` e HS256 nem chegam a ser considerados
    if (parsedHeader.alg !== HEADER.alg) throw new InvalidJwtError('algoritmo');

    const valid = verify(
      null,
      Buffer.from(`${header}.${payload}`, 'utf8'),
      this.publicKey,
      Buffer.from(signature, 'base64url'),
    );
    if (!valid) throw new InvalidJwtError('assinatura');

    const claims = decode(payload) as Partial<JwtClaims>;
    const now = Math.floor(this.clock.now().getTime() / 1000);

    if (typeof claims.sub !== 'string' || claims.sub === '') throw new InvalidJwtError('sub');
    if (claims.iss !== this.expected.issuer) throw new InvalidJwtError('emissor');
    if (claims.aud !== this.expected.audience) throw new InvalidJwtError('audiência');
    if (typeof claims.exp !== 'number' || claims.exp <= now) throw new InvalidJwtError('expirado');
    if (typeof claims.iat !== 'number' || claims.iat > now + 60)
      throw new InvalidJwtError('emitido no futuro');

    return claims as JwtClaims;
  }
}

/** Par Ed25519 em PEM — para desenvolvimento e testes; produção lê do ambiente. */
export function generateEd25519KeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
