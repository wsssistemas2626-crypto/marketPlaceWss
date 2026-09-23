import { pagina } from '../estilos';
import { Confirmacao } from './confirmacao';

export const metadata = { title: 'Confirmar e-mail' };

export default function ConfirmarPage() {
  return (
    <main style={pagina}>
      <h1 style={{ fontWeight: 'var(--mkt-heading-weight, 700)' as never }}>Confirmação de e-mail</h1>
      <Confirmacao />
    </main>
  );
}
