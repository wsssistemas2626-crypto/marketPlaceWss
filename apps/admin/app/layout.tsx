import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Cabecalho } from './cabecalho';

export const metadata: Metadata = {
  title: 'Admin do tenant',
  description: 'Admin do tenant da plataforma de marketplace.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      localization={ptBR}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      /* sem um destino explícito, a Clerk manda para o portal hospedado depois do login */
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
    >
      <html lang="pt-BR">
        <body style={{ margin: 0 }}>
          <Cabecalho />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
