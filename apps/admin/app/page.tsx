import Link from 'next/link';

import { pagina } from '../lib/ui';

export default function Home() {
  return (
    <main style={pagina}>
      <h1>Admin do tenant</h1>
      <p>Backoffice do operador do marketplace.</p>

      <ul>
        <li>
          <Link href="/tema">Tema da loja</Link> — rascunho, preview e publicação (US-077)
        </li>
        <li>
          <Link href="/suporte">Acessos de suporte</Link> — quem da plataforma entrou na sua conta (US-080)
        </li>
      </ul>

      <p>Catálogo, pedidos e demais telas chegam nos próximos marcos da Fase 1.</p>
    </main>
  );
}
