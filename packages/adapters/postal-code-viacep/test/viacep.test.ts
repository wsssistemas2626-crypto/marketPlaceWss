import { describe, expect, it } from 'vitest';

import { ViaCepPostalCode, ViaCepUnavailableError } from '../src/index.js';

const resposta = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('ViaCepPostalCode', () => {
  it('traduz a resposta do ViaCEP e pede com o CEP só em dígitos', async () => {
    const chamadas: string[] = [];
    const fetchImpl = (async (url: string) => {
      chamadas.push(url);
      return new Response(
        JSON.stringify({
          cep: '01001-000',
          logradouro: 'Praça da Sé',
          bairro: 'Sé',
          localidade: 'São Paulo',
          uf: 'SP',
        }),
      );
    }) as unknown as typeof fetch;

    const endereco = await new ViaCepPostalCode({ fetchImpl }).lookup('01001-000');

    expect(chamadas).toEqual(['https://viacep.com.br/ws/01001000/json/']);
    expect(endereco).toEqual({
      zipCode: '01001000',
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('CEP inexistente ({ erro: true }) ou malformado (400) é undefined', async () => {
    await expect(
      new ViaCepPostalCode({ fetchImpl: resposta(200, { erro: 'true' }) }).lookup('99999999'),
    ).resolves.toBeUndefined();
    await expect(
      new ViaCepPostalCode({ fetchImpl: resposta(400, {}) }).lookup('12345678'),
    ).resolves.toBeUndefined();
  });

  it('CEP com tamanho errado nem chega a consultar', async () => {
    const fetchImpl = (async () => {
      throw new Error('não devia chamar');
    }) as unknown as typeof fetch;

    await expect(new ViaCepPostalCode({ fetchImpl }).lookup('123')).resolves.toBeUndefined();
  });

  it('CEP geral de cidade (sem rua e bairro) volta com esses campos vazios', async () => {
    const endereco = await new ViaCepPostalCode({
      fetchImpl: resposta(200, {
        cep: '78890-000',
        logradouro: '',
        bairro: '',
        localidade: 'Sorriso',
        uf: 'MT',
      }),
    }).lookup('78890000');

    expect(endereco).toMatchObject({ street: '', district: '', city: 'Sorriso', state: 'MT' });
  });

  it('serviço fora (5xx ou rede) é erro, não "CEP inexistente"', async () => {
    await expect(
      new ViaCepPostalCode({ fetchImpl: resposta(503, {}) }).lookup('01001000'),
    ).rejects.toBeInstanceOf(ViaCepUnavailableError);

    const semRede = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new ViaCepPostalCode({ fetchImpl: semRede }).lookup('01001000')).rejects.toBeInstanceOf(
      ViaCepUnavailableError,
    );
  });
});
