process.loadEnvFile(new URL('../../../.env', import.meta.url));

const hostDaChave = (nome) => {
  const chave = process.env[nome];
  if (chave === undefined || chave === '') return `${nome}: ausente`;
  const codificado = chave.replace(/^pk_(test|live)_/, '');
  const host = Buffer.from(codificado, 'base64').toString('utf8').replace(/\$$/, '');
  return `${nome}: ${chave.slice(0, 8)}… -> ${host}`;
};

console.log(hostDaChave('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
console.log(hostDaChave('CONSOLE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
console.log(hostDaChave('NEXT_PUBLIC_CONSOLE_CLERK_PUBLISHABLE_KEY'));

for (const nome of ['CLERK_SECRET_KEY', 'CONSOLE_CLERK_SECRET_KEY']) {
  const secreta = process.env[nome];
  if (secreta === undefined || secreta === '') {
    console.log(`${nome}: ausente`);
    continue;
  }
  const resposta = await fetch('https://api.clerk.com/v1/instance', {
    headers: { authorization: `Bearer ${secreta}` },
  });
  const corpo = await resposta.json().catch(() => ({}));
  console.log(
    `${nome}: ${secreta.slice(0, 8)}… -> instância ${corpo.id ?? resposta.status} (${corpo.environment_type ?? '?'})`,
  );
}
