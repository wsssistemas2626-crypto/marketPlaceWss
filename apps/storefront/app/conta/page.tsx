import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { fetchDoComprador } from '../../lib/api';
import { COOKIE_ACESSO } from '../../lib/sessao';
import { botao, pagina, sucesso } from './estilos';
import { sair } from './sessao-acoes';

export const metadata = { title: 'Minha conta' };

interface Perfil {
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/**
 * Minha conta (US-011). Sem access token válido, vai para o login — o
 * middleware já tentou renovar com o refresh antes de chegar aqui.
 */
export default async function ContaPage() {
  const acesso = (await cookies()).get(COOKIE_ACESSO)?.value;
  const perfil =
    acesso === undefined ? undefined : await fetchDoComprador<Perfil>('/v1/store/customers/me', acesso);

  if (perfil === undefined) redirect('/conta/entrar');

  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Olá, {perfil.name}</h1>
      <p>{perfil.email}</p>
      {perfil.emailVerified ? null : (
        <p style={sucesso}>Confirme seu e-mail pelo link que enviamos para poder comprar.</p>
      )}
      <p>
        <Link href="/conta/enderecos">Meus endereços</Link>
      </p>
      <form action={sair}>
        <button type="submit" style={botao}>
          Sair
        </button>
      </form>
    </main>
  );
}
