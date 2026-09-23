'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { chamarComoComprador } from '../../../lib/api';
import { COOKIE_ACESSO } from '../../../lib/sessao';

export interface EstadoEndereco {
  readonly salvo: boolean;
  readonly erro?: string;
  readonly campo?: string;
}

const token = async (): Promise<string> => (await cookies()).get(COOKIE_ACESSO)?.value ?? '';

const CAMPOS = [
  'label',
  'recipientName',
  'zipCode',
  'street',
  'number',
  'complement',
  'district',
  'city',
  'state',
];

/** Cadastra um endereço (US-014). O dono é a sessão — nada no formulário identifica o comprador. */
export async function adicionarEndereco(_anterior: EstadoEndereco, dados: FormData): Promise<EstadoEndereco> {
  const corpo: Record<string, unknown> = { isDefault: dados.get('isDefault') === 'on' };
  for (const campo of CAMPOS) {
    const valor = String(dados.get(campo) ?? '').trim();
    if (valor !== '') corpo[campo] = valor;
  }

  const resultado = await chamarComoComprador(
    await token(),
    'POST',
    '/v1/store/customers/me/addresses',
    corpo,
    { idempotent: true },
  );

  if (resultado.error !== undefined) {
    return {
      salvo: false,
      erro: resultado.error,
      ...(resultado.field === undefined ? {} : { campo: resultado.field }),
    };
  }

  revalidatePath('/conta/enderecos');
  return { salvo: true };
}

export async function removerEndereco(id: string): Promise<void> {
  await chamarComoComprador(
    await token(),
    'DELETE',
    `/v1/store/customers/me/addresses/${encodeURIComponent(id)}`,
  );
  revalidatePath('/conta/enderecos');
}

export async function tornarPadrao(endereco: Record<string, unknown>): Promise<void> {
  const { id, ...campos } = endereco;
  await chamarComoComprador(
    await token(),
    'PUT',
    `/v1/store/customers/me/addresses/${encodeURIComponent(String(id))}`,
    { ...campos, isDefault: true },
  );
  revalidatePath('/conta/enderecos');
}

export interface Cep {
  readonly found: boolean;
  readonly address?: { street: string; district: string; city: string; state: string };
  readonly erro?: string;
}

/** Autocompletar: com o serviço fora, a tela avisa e deixa preencher à mão. */
export async function consultarCep(cep: string): Promise<Cep> {
  const resultado = await chamarComoComprador<Cep>(
    await token(),
    'GET',
    `/v1/store/postal-codes?zipCode=${encodeURIComponent(cep)}`,
  );
  return (
    resultado.data ?? { found: false, ...(resultado.error === undefined ? {} : { erro: resultado.error }) }
  );
}
