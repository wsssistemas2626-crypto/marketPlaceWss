'use client';

import { useActionState, useRef, useState } from 'react';

import { botao, campo, entrada, erro, sucesso } from '../estilos';
import { adicionarEndereco, consultarCep, type EstadoEndereco } from './acoes';

const inicial: EstadoEndereco = { salvo: false };

const CAMPOS = [
  { nome: 'label', rotulo: 'Apelido (opcional)', autocomplete: 'off' },
  { nome: 'recipientName', rotulo: 'Quem recebe', autocomplete: 'name' },
  { nome: 'zipCode', rotulo: 'CEP', autocomplete: 'postal-code' },
  { nome: 'street', rotulo: 'Rua', autocomplete: 'address-line1' },
  { nome: 'number', rotulo: 'Número', autocomplete: 'off' },
  { nome: 'complement', rotulo: 'Complemento (opcional)', autocomplete: 'address-line2' },
  { nome: 'district', rotulo: 'Bairro', autocomplete: 'address-level3' },
  { nome: 'city', rotulo: 'Cidade', autocomplete: 'address-level2' },
  { nome: 'state', rotulo: 'UF', autocomplete: 'address-level1' },
] as const;

/** Cadastro de endereço com autocompletar de CEP (RF-IAM-09). */
export function FormularioEndereco() {
  const [estado, enviar, enviando] = useActionState(adicionarEndereco, inicial);
  const [avisoCep, setAvisoCep] = useState<string | undefined>();
  const formulario = useRef<HTMLFormElement>(null);

  const preencherPeloCep = async (cep: string) => {
    if (cep.replace(/\D/g, '').length !== 8) return;

    const resposta = await consultarCep(cep);
    if (!resposta.found || resposta.address === undefined) {
      setAvisoCep(resposta.erro ?? 'CEP não encontrado. Confira ou preencha o endereço à mão.');
      return;
    }

    setAvisoCep(undefined);
    for (const [nome, valor] of Object.entries(resposta.address)) {
      const input = formulario.current?.elements.namedItem(nome);
      // CEP geral de cidade não traz rua e bairro: não apaga o que a pessoa digitou
      if (input instanceof HTMLInputElement && valor !== '') input.value = valor;
    }
  };

  return (
    <form ref={formulario} action={enviar} key={estado.salvo ? 'novo' : 'editando'}>
      {estado.salvo ? <p style={sucesso}>Endereço salvo.</p> : null}

      {CAMPOS.map(({ nome, rotulo, autocomplete }) => (
        <label key={nome} style={campo}>
          <span>{rotulo}</span>
          {nome === 'zipCode' ? (
            <input
              name={nome}
              autoComplete={autocomplete}
              inputMode="numeric"
              aria-invalid={estado.campo === nome}
              onBlur={(evento) => void preencherPeloCep(evento.target.value)}
              style={entrada}
            />
          ) : (
            <input
              name={nome}
              autoComplete={autocomplete}
              aria-invalid={estado.campo === nome}
              style={entrada}
            />
          )}
          {nome === 'zipCode' && avisoCep !== undefined ? <span style={erro}>{avisoCep}</span> : null}
          {estado.campo === nome ? <span style={erro}>{estado.erro}</span> : null}
        </label>
      ))}

      <label style={{ ...campo, display: 'flex', gap: '.5rem' }}>
        <input name="isDefault" type="checkbox" />
        <span>Usar como endereço padrão</span>
      </label>

      {estado.erro !== undefined && estado.campo === undefined ? (
        <p role="alert" style={erro}>
          {estado.erro}
        </p>
      ) : null}

      <button type="submit" disabled={enviando} style={botao}>
        {enviando ? 'Salvando…' : 'Salvar endereço'}
      </button>
    </form>
  );
}
