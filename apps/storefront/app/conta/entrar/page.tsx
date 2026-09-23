import { pagina } from '../estilos';
import { FormularioLogin } from './formulario';

export const metadata = { title: 'Entrar' };

/** Login do comprador nesta loja (US-011). */
export default function EntrarPage() {
  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Entrar</h1>
      <FormularioLogin />
    </main>
  );
}
