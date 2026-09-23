import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { fetchDoComprador } from '../../../lib/api';
import { COOKIE_ACESSO } from '../../../lib/sessao';
import { pagina } from '../estilos';
import { removerEndereco, tornarPadrao } from './acoes';
import { FormularioEndereco } from './formulario';

export const metadata = { title: 'Meus endereços' };

interface Endereco {
  readonly id: string;
  readonly label?: string;
  readonly recipientName: string;
  readonly zipCode: string;
  readonly street: string;
  readonly number: string;
  readonly complement?: string;
  readonly district: string;
  readonly city: string;
  readonly state: string;
  readonly isDefault: boolean;
}

const formatarCep = (digitos: string) => `${digitos.slice(0, 5)}-${digitos.slice(5)}`;

/** Endereços do comprador (US-014). Sem sessão, vai para o login. */
export default async function EnderecosPage() {
  const acesso = (await cookies()).get(COOKIE_ACESSO)?.value;
  const resposta =
    acesso === undefined
      ? undefined
      : await fetchDoComprador<{ data: Endereco[] }>('/v1/store/customers/me/addresses', acesso);

  if (resposta === undefined) redirect('/conta/entrar');

  return (
    <main style={pagina}>
      <p>
        <Link href="/conta">← Minha conta</Link>
      </p>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Meus endereços</h1>

      {resposta.data.length === 0 ? <p>Nenhum endereço ainda.</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {resposta.data.map((endereco) => (
          <li
            key={endereco.id}
            style={{ padding: '.75rem 0', borderBottom: '1px solid var(--mkt-color-surface, #eee)' }}
          >
            <strong>{endereco.label ?? endereco.recipientName}</strong>
            {endereco.isDefault ? ' · padrão' : null}
            <br />
            {endereco.street}, {endereco.number}
            {endereco.complement === undefined ? '' : ` — ${endereco.complement}`}
            <br />
            {endereco.district}, {endereco.city}/{endereco.state} · {formatarCep(endereco.zipCode)}
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.25rem' }}>
              {endereco.isDefault ? null : (
                <form action={tornarPadrao.bind(null, { ...endereco })}>
                  <button type="submit">Tornar padrão</button>
                </form>
              )}
              <form action={removerEndereco.bind(null, endereco.id)}>
                <button type="submit">Remover</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <h2>Novo endereço</h2>
      <FormularioEndereco />
    </main>
  );
}
