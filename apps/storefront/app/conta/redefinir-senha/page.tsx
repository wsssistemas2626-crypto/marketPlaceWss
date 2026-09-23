import { pagina } from '../estilos';
import { FormularioNovaSenha } from './formulario';

export const metadata = { title: 'Nova senha' };

/** Escolha da senha nova pelo link do e-mail (US-012). */
export default function RedefinirSenhaPage() {
  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Nova senha</h1>
      <FormularioNovaSenha />
    </main>
  );
}
