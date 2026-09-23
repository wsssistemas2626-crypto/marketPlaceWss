import type { PostalCodeAddress, PostalCodePort } from '@mkt/contracts';

export interface ViaCepOptions {
  /** Injetável para teste; em produção é o `fetch` global. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  /** O CEP é autocompletar: resposta lenta é pior que nenhuma (o comprador digita). */
  readonly timeoutMs?: number;
}

interface ViaCepResponse {
  readonly cep?: string;
  readonly logradouro?: string;
  readonly bairro?: string;
  readonly localidade?: string;
  readonly uf?: string;
  readonly erro?: boolean | string;
}

export class ViaCepUnavailableError extends Error {
  constructor(detail: string) {
    super(`ViaCEP indisponível: ${detail}`);
    this.name = 'ViaCepUnavailableError';
  }
}

/**
 * CEP pelo ViaCEP (https://viacep.com.br) — público, sem conta nem chave.
 *
 * CEP inexistente volta `{ "erro": true }` com status 200; isso vira
 * `undefined`. Rede fora, 5xx ou tempo esgotado viram erro: quem chama decide
 * se deixa o comprador preencher à mão.
 */
export class ViaCepPostalCode implements PostalCodePort {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ViaCepOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://viacep.com.br/ws';
    this.timeoutMs = options.timeoutMs ?? 3_000;
  }

  async lookup(zipCode: string): Promise<PostalCodeAddress | undefined> {
    const digits = zipCode.replace(/\D/g, '');
    if (digits.length !== 8) return undefined;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${digits}/json/`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new ViaCepUnavailableError(error instanceof Error ? error.name : 'rede');
    }

    // o ViaCEP responde 400 para CEP malformado: é "não existe", não "fora do ar"
    if (response.status === 400) return undefined;
    if (!response.ok) throw new ViaCepUnavailableError(`HTTP ${response.status}`);

    const body = (await response.json()) as ViaCepResponse;
    if (body.erro !== undefined && body.erro !== false) return undefined;
    if (body.localidade === undefined || body.uf === undefined) return undefined;

    return {
      zipCode: digits,
      // CEP geral de cidade pequena não tem rua nem bairro: o comprador preenche
      street: body.logradouro ?? '',
      district: body.bairro ?? '',
      city: body.localidade,
      state: body.uf,
    };
  }
}
