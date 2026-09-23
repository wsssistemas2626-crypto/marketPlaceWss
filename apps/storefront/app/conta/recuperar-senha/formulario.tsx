'use client';

import { useActionState } from 'react';

import { botao, campo, entrada, erro, sucesso } from '../estilos';
import { pedirTroca, type EstadoSenha } from '../senha-acoes';

const inicial: EstadoSenha = { enviado: false };

export function FormularioRecuperacao() {
  const [estado, enviar, enviando] = useActionState(pedirTroca, inicial);

  if (estado.enviado) {
    return (
      <p role="status" style={sucesso}>
        {estado.mensagem}
      </p>
    );
  }

  return (
    <form action={enviar}>
      <label style={campo}>
        <span>E-mail da conta</span>
        <input name="email" type="email" autoComplete="email" required style={entrada} />
      </label>
      {estado.erro === undefined ? null : (
        <p role="alert" style={erro}>
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={enviando} style={botao}>
        {enviando ? 'Enviando…' : 'Enviar link'}
      </button>
    </form>
  );
}
