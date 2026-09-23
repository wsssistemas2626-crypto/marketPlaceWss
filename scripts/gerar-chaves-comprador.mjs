#!/usr/bin/env node
/**
 * Gera o par Ed25519 do access token do comprador (US-011) no formato do
 * `.env`: PEM numa linha só, com `\n` no lugar das quebras.
 *
 *   node scripts/gerar-chaves-comprador.mjs
 *
 * Cole a saída no `.env` (local) ou nas variáveis da Railway. A chave privada
 * é segredo: não vai para o repositório nem para log.
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const linha = (nome, pem) => `${nome}="${pem.trim().replace(/\n/g, '\\n')}"`;

console.log(
  linha('CUSTOMER_JWT_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
);
console.log(linha('CUSTOMER_JWT_PUBLIC_KEY', publicKey.export({ type: 'spki', format: 'pem' }).toString()));
