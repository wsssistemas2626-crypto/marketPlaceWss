import { pagina } from '../estilos';
import { FormularioRecuperacao } from './formulario';

export const metadata = { title: 'Recuperar senha' };

/** Pedido de troca de senha (US-012). */
export default function RecuperarSenhaPage() {
  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Recuperar senha</h1>
      <p>Enviamos um link para trocar a senha. Ele vale por 1 hora.</p>
      <FormularioRecuperacao />
    </main>
  );
}
