import { connect, type Socket } from 'node:net';

import type { EmailMessage, EmailPort } from '@mkt/contracts';

/**
 * E-mail de **desenvolvimento**: entrega no Mailpit do docker-compose
 * (`SMTP_URL=smtp://localhost:1025`, caixa em http://localhost:8025).
 *
 * É um cliente SMTP mínimo — sem TLS nem autenticação, que o Mailpit local
 * não pede — para quem desenvolve ver o link de confirmação de verdade sem
 * depender de provedor. **Não serve para produção**: provedor real entra como
 * adapter próprio na US-058, pelo hub de integrações.
 */
export class MailpitEmail implements EmailPort {
  private readonly host: string;
  private readonly port: number;

  constructor(
    smtpUrl: string,
    private readonly from = 'loja@marketplace.localhost',
  ) {
    const url = new URL(smtpUrl);
    this.host = url.hostname;
    this.port = Number(url.port || 25);
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@marketplace.localhost>`;
    const text =
      typeof message.data.text === 'string' ? message.data.text : JSON.stringify(message.data, null, 2);
    const subject = message.subject ?? message.template;

    const body = [
      `From: ${this.from}`,
      `To: ${message.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      // base64 em linhas de 76: nenhum caractere do texto conflita com o protocolo
      ...(Buffer.from(text, 'utf8')
        .toString('base64')
        .match(/.{1,76}/g) ?? []),
    ].join('\r\n');

    await this.session(async (command) => {
      await command(undefined, 220);
      await command('EHLO marketplace.localhost', 250);
      await command(`MAIL FROM:<${this.from}>`, 250);
      await command(`RCPT TO:<${message.to}>`, 250);
      await command('DATA', 354);
      await command(`${body}\r\n.`, 250);
      await command('QUIT', 221);
    });

    return { messageId };
  }

  /** Conversa SMTP linha a linha: cada comando espera o código de resposta. */
  private session(
    dialog: (command: (line: string | undefined, expected: number) => Promise<void>) => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket: Socket = connect({ host: this.host, port: this.port });
      let buffer = '';
      let waiting: ((reply: string) => void) | undefined;

      socket.setEncoding('utf8');
      socket.setTimeout(10_000, () => socket.destroy(new Error('SMTP: tempo esgotado')));
      socket.on('error', reject);
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        // resposta completa: a última linha tem espaço depois do código ("250 OK")
        const lines = buffer.split('\r\n').filter((line) => line !== '');
        const last = lines.at(-1);
        if (last !== undefined && /^\d{3} /.test(last) && buffer.endsWith('\r\n')) {
          const reply = buffer;
          buffer = '';
          waiting?.(reply);
        }
      });

      const command = (line: string | undefined, expected: number): Promise<void> =>
        new Promise((done, fail) => {
          waiting = (reply) => {
            const code = Number(reply.slice(0, 3));
            if (code === expected) done();
            else fail(new Error(`SMTP: esperava ${expected}, recebeu ${reply.trim().slice(0, 80)}`));
          };
          if (line !== undefined) socket.write(`${line}\r\n`);
        });

      dialog(command)
        .then(() => {
          socket.end();
          resolve();
        })
        .catch((error: unknown) => {
          socket.destroy();
          reject(error);
        });
    });
  }
}
