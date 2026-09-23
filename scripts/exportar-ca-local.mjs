#!/usr/bin/env node
/**
 * Exporta para `.certs/ca-local.pem` a raiz que assina o HTTPS **nesta máquina**.
 *
 * Só faz sentido onde há inspeção de TLS (antivírus como o Norton, proxy
 * corporativo, Zscaler e afins): a cadeia que chega não é a do servidor, e sim
 * uma reemitida por uma raiz local. O Node principal costuma confiar nela pela
 * loja do sistema, mas o sandbox de *edge runtime* do Next usa a lista de CAs
 * embutida e recusa a conexão (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) — o
 * middleware da Clerk não consegue buscar o JWKS e o login entra em laço.
 *
 * O arquivo é ignorado pelo git e o `scripts/with-env.mjs` o usa como
 * `NODE_EXTRA_CA_CERTS` ao subir os apps Next.
 *
 * Sem inspeção de TLS, o script avisa que não há nada a fazer e sai.
 */
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, '.certs', 'ca-local.pem');
const HOST = process.argv[2] ?? 'api.clerk.com';

const paraPem = (certificado) =>
  `-----BEGIN CERTIFICATE-----\n${(certificado.raw.toString('base64').match(/.{1,64}/g) ?? []).join('\n')}\n-----END CERTIFICATE-----\n`;

const raizDaCadeia = (certificado) => {
  const vistos = new Set();
  let atual = certificado;

  while (atual !== undefined && !vistos.has(atual.fingerprint)) {
    vistos.add(atual.fingerprint);
    if (atual.issuerCertificate === undefined || atual.issuerCertificate === atual) return atual;
    atual = atual.issuerCertificate;
  }

  return atual;
};

const conexao = tls.connect({ host: HOST, port: 443, servername: HOST, rejectUnauthorized: false }, () => {
  const raiz = raizDaCadeia(conexao.getPeerCertificate(true));
  conexao.end();

  if (raiz === undefined) {
    console.log(`Não consegui ler a cadeia de ${HOST}.`);
    process.exitCode = 1;
    return;
  }

  const nome = raiz.subject?.CN ?? raiz.subject?.O ?? '(sem nome)';

  // raiz pública = sem inspeção; o certificado embutido do Node já resolve
  if (tls.rootCertificates.includes(paraPem(raiz).trim())) {
    console.log(`A cadeia de ${HOST} termina em uma raiz pública (${nome}) — nada a exportar.`);
    return;
  }

  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, paraPem(raiz));
  console.log(
    `Raiz local exportada: ${nome}\n  -> ${DESTINO}\nRode \`pnpm dev\` de novo para os apps Next a usarem.`,
  );
});

conexao.on('error', (erro) => {
  console.log(`Falha ao conectar em ${HOST}: ${erro.message}`);
  process.exitCode = 1;
});
