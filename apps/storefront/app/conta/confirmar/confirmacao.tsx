'use client';

import { useEffect, useState } from 'react';

import { confirmarEmail } from '../acoes';
import { erro, sucesso } from '../estilos';

/**
 * O token chega no fragmento (`#token=…`), que o navegador não manda ao
 * servidor: não aparece em log de acesso nem em `Referer`. Por isso a leitura
 * é aqui, no cliente, e a confirmação vai por server action.
 */
export function Confirmacao() {
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | undefined>();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // tira o token da barra de endereço e do histórico
    window.history.replaceState(null, '', window.location.pathname);

    const confirmacao =
      token === null || token === ''
        ? Promise.resolve({ ok: false, mensagem: 'Link incompleto. Abra o link do e-mail de novo.' })
        : confirmarEmail(token);

    void confirmacao.then(setResultado);
  }, []);

  if (resultado === undefined) return <p>Confirmando…</p>;

  return (
    <p role={resultado.ok ? 'status' : 'alert'} style={resultado.ok ? sucesso : erro}>
      {resultado.mensagem}
    </p>
  );
}
