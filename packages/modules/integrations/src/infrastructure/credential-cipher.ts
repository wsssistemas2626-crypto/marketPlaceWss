import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ValidationError } from '@mkt/shared-kernel';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Criptografia das credenciais de provedor (RF-INT-01).
 *
 * AES-256-GCM: além de cifrar, autentica — credencial adulterada no banco
 * falha ao decifrar em vez de virar lixo silencioso. A chave vem de
 * `INTEGRATIONS_ENCRYPTION_KEY` (KMS em produção).
 */
export class CredentialCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new ValidationError('INTEGRATIONS_ENCRYPTION_KEY deve ter 32 bytes em base64', {
        field: 'INTEGRATIONS_ENCRYPTION_KEY',
      });
    }
    this.key = key;
  }

  encrypt(credentials: Readonly<Record<string, string>>): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const payload = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);

    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), payload.toString('base64')].join(
      '.',
    );
  }

  decrypt(encrypted: string): Record<string, string> {
    const [iv, authTag, payload] = encrypted.split('.');
    if (iv === undefined || authTag === undefined || payload === undefined) {
      throw new ValidationError('Credencial criptografada em formato inválido');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const clear = Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString(
      'utf8',
    );

    return JSON.parse(clear) as Record<string, string>;
  }
}
