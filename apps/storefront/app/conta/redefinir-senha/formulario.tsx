'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';

import { botao, campo, entrada, erro, sucesso } from '../estilos';
import { trocarSenha, type EstadoSenha } from '../senha-acoes';

const inicial: EstadoSenha = { enviado: false };

/**
 * O token chega no fragmento (`#token=…`), que não vai ao servidor nem ao
 * `Referer`. É lido aqui e tirado da barra de endereço.
 */
export function FormularioNovaSenha() {
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    const lido = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    // estado assíncrono, depois da pintura: o token não existe no servidor
    void Promise.resolve(lido).then(setToken);
  }, []);

  const [estado, enviar, enviando] = useActionState(
    (anterior: EstadoSenha, dados: FormData) => trocarSenha(token ?? '', anterior, dados),
    inicial,
  );

  if (estado.enviado) {
    return (
      <p role="status" style={sucesso}>
        {estado.mensagem} <Link href="/conta/entrar">Entrar</Link>
      </p>
    );
  }

  if (token === '') {
    return (
      <p role="alert" style={erro}>
        Link incompleto. <Link href="/conta/recuperar-senha">Peça um novo</Link>.
      </p>
    );
  }

  return (
    <form action={enviar}>
      <label style={campo}>
        <span>Nova senha (10+ caracteres, letras e números)</span>
        <input name="password" type="password" autoComplete="new-password" required style={entrada} />
        {estado.campo === 'password' ? <span style={erro}>{estado.erro}</span> : null}
      </label>
      {estado.erro !== undefined && estado.campo !== 'password' ? (
        <p role="alert" style={erro}>
          {estado.erro}
        </p>
      ) : null}
      <button type="submit" disabled={enviando || token === undefined} style={botao}>
        {enviando ? 'Trocando…' : 'Trocar senha'}
      </button>
    </form>
  );
}
