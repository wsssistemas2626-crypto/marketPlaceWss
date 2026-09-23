import { SignIn } from '@clerk/nextjs';

/** Login do painel dentro do próprio app — sem depender do portal hospedado. */
export default function SignInPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <SignIn fallbackRedirectUrl="/" />
    </main>
  );
}
