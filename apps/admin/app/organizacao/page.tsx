import { OrganizationList } from '@clerk/nextjs';

/**
 * Escolha da organização ativa.
 *
 * Sem organização ativa não há tenant (ADR-013), e a API recusaria qualquer
 * chamada. Esta tela existe para quem entrou e ainda não escolheu — é para
 * onde o middleware manda, em vez de repetir o login.
 */
export default function OrganizacaoPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/"
        afterCreateOrganizationUrl="/"
        skipInvitationScreen
      />
    </main>
  );
}
