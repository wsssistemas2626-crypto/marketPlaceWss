'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { botao, campo, entrada, erro } from '../estilos';
import { entrar, type EstadoLogin } from '../sessao-acoes';

const inicial: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, enviar, enviando] = useActionState(entrar, inicial);

  return (
    <form action={enviar}>
      <label style={campo}>
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="email" required style={entrada} />
      </label>
      <label style={campo}>
        <span>Senha</span>
        <input name="password" type="password" autoComplete="current-password" required style={entrada} />
      </label>

      {estado.erro === undefined ? null : (
        <p role="alert" style={erro}>
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={enviando} style={botao}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>

      <p>
        <Link href="/conta/recuperar-senha">Esqueci a senha</Link> · Ainda não tem conta?{' '}
        <Link href="/conta/cadastro">Criar conta</Link>
      </p>
    </form>
  );
}
