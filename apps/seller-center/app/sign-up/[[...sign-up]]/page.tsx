import { SignUp } from '@clerk/nextjs';

/** Cadastro no painel — o convite ou o domínio da organização define o acesso. */
export default function SignUpPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <SignUp />
    </main>
  );
}
