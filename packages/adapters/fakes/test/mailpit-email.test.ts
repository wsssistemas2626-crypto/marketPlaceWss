import { createServer, type AddressInfo, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { MailpitEmail } from '../src/mailpit-email.js';

/** Servidor SMTP mínimo que responde como o Mailpit e guarda a conversa. */
function servidorSmtp(): Promise<{ server: Server; port: number; comandos: string[]; dados: string[] }> {
  const comandos: string[] = [];
  const dados: string[] = [];

  const server = createServer((socket) => {
    let emDados = false;
    let acumulado = '';
    socket.write('220 mailpit ESMTP\r\n');

    socket.on('data', (chunk) => {
      acumulado += chunk.toString('utf8');

      if (emDados) {
        if (!acumulado.endsWith('\r\n.\r\n')) return;
        dados.push(acumulado);
        acumulado = '';
        emDados = false;
        socket.write('250 2.0.0 Ok: queued\r\n');
        return;
      }

      const linhas = acumulado.split('\r\n');
      acumulado = linhas.pop() ?? '';
      for (const linha of linhas) {
        comandos.push(linha);
        if (linha.startsWith('EHLO')) socket.write('250-mailpit\r\n250 PIPELINING\r\n');
        else if (linha === 'DATA') {
          emDados = true;
          socket.write('354 go ahead\r\n');
        } else if (linha === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, comandos, dados });
    });
  });
}

describe('MailpitEmail (e-mail de desenvolvimento)', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it('entrega a mensagem com assunto e corpo em UTF-8', async () => {
    const smtp = await servidorSmtp();
    server = smtp.server;

    const resultado = await new MailpitEmail(`smtp://127.0.0.1:${smtp.port}`).send({
      to: 'ana@exemplo.com',
      template: 'identity.customer_verification',
      subject: 'Confirme seu e-mail',
      data: { text: 'Olá, Ana! Confirme: http://loja-a.localhost:3000/conta/confirmar#token=abc' },
    });

    expect(resultado.messageId).toMatch(/@marketplace\.localhost>$/);
    expect(smtp.comandos).toEqual([
      'EHLO marketplace.localhost',
      'MAIL FROM:<loja@marketplace.localhost>',
      'RCPT TO:<ana@exemplo.com>',
      'DATA',
      'QUIT',
    ]);

    const [mensagem] = smtp.dados;
    expect(mensagem).toContain('To: ana@exemplo.com');
    const corpo =
      mensagem
        ?.split('\r\n\r\n')[1]
        ?.replace(/\r\n\.\r\n$/, '')
        .replace(/\r\n/g, '') ?? '';
    expect(Buffer.from(corpo, 'base64').toString('utf8')).toContain('Olá, Ana!');
  });

  it('servidor fora do ar vira erro (o caso de uso decide o que fazer)', async () => {
    await expect(
      new MailpitEmail('smtp://127.0.0.1:1').send({ to: 'a@b.com', template: 't', data: {} }),
    ).rejects.toThrow();
  });
});
