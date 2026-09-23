'use client';

import { useActionState } from 'react';

import { cadastrar, type EstadoCadastro } from '../acoes';
import { botao, campo, entrada, erro, sucesso } from '../estilos';

const inicial: EstadoCadastro = { enviado: false };

const CAMPOS = [
  { nome: 'name', rotulo: 'Nome completo', tipo: 'text', autocomplete: 'name' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email' },
  { nome: 'document', rotulo: 'CPF ou CNPJ', tipo: 'text', autocomplete: 'off' },
  {
    nome: 'password',
    rotulo: 'Senha (10+ caracteres, letras e números)',
    tipo: 'password',
    autocomplete: 'new-password',
  },
] as const;

export function FormularioCadastro() {
  const [estado, enviar, enviando] = useActionState(cadastrar, inicial);

  if (estado.enviado) {
    return (
      <p role="status" style={sucesso}>
        {estado.mensagem}
      </p>
    );
  }

  return (
    <form action={enviar} noValidate>
      {CAMPOS.map(({ nome, rotulo, tipo, autocomplete }) => (
        <label key={nome} style={campo}>
          <span>{rotulo}</span>
          <input
            name={nome}
            type={tipo}
            autoComplete={autocomplete}
            required
            aria-invalid={estado.campo === nome}
            style={entrada}
          />
          {estado.campo === nome ? <span style={erro}>{estado.erro}</span> : null}
        </label>
      ))}

      <label style={{ ...campo, display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
        <input name="acceptTerms" type="checkbox" required />
        <span>Li e aceito os termos de uso e a política de privacidade da loja.</span>
      </label>
      {estado.campo === 'acceptTerms' ? <p style={erro}>{estado.erro}</p> : null}

      {estado.erro !== undefined && estado.campo === undefined ? (
        <p role="alert" style={erro}>
          {estado.erro}
        </p>
      ) : null}

      <button type="submit" disabled={enviando} style={botao}>
        {enviando ? 'Enviando…' : 'Criar conta'}
      </button>
    </form>
  );
}
