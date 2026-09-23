import { pagina } from '../estilos';
import { FormularioCadastro } from './formulario';

export const metadata = { title: 'Criar conta' };

/** Cadastro do comprador nesta loja (US-010) — a conta vale só para este marketplace. */
export default function CadastroPage() {
  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Criar conta</h1>
      <FormularioCadastro />
    </main>
  );
}
