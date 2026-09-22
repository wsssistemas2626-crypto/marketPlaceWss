#!/usr/bin/env node
/**
 * Executa um comando com o `.env` da raiz carregado no ambiente.
 *
 * Os hosts Nest chamam `process.loadEnvFile()` no próprio bootstrap, mas o
 * Next.js só procura arquivos `.env` dentro da pasta do app — em um monorepo
 * isso deixa o storefront sem `EDGE_SHARED_SECRET` e os painéis sem as chaves
 * da Clerk, e o tenant deixa de ser resolvido pelo host em desenvolvimento.
 *
 * Só vale para o desenvolvimento local: na Railway as variáveis chegam pelo
 * ambiente e o arquivo simplesmente não existe.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(raiz, '.env'));
} catch {
  // sem .env: segue com o ambiente do processo
}

const [comando, ...argumentos] = process.argv.slice(2);
const filho = spawn(comando, argumentos, { stdio: 'inherit', shell: true });

filho.on('exit', (codigo, sinal) => {
  process.exit(sinal === null ? (codigo ?? 0) : 1);
});
