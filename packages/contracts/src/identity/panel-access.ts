import type { OrganizationKind } from '../integrations/ports.js';

/**
 * Catálogo de papéis e permissões dos painéis (ADR-013 / RF-IAM-07).
 *
 * É a **fonte única** das duas pontas: o script `pnpm clerk:roles` cria na
 * Clerk exatamente o que está aqui, e a API usa o mesmo catálogo para recusar
 * papel fora do tipo da organização e para exigir MFA (RF-IAM-14). Mudou uma
 * permissão? Muda aqui e roda o script de novo — ele é idempotente.
 */

export interface PanelPermission {
  /** `org:<funcionalidade>:<ação>` — formato exigido pela Clerk. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export interface PanelRole {
  /** `org:<papel>` — formato exigido pela Clerk. */
  readonly key: string;
  readonly kind: OrganizationKind;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
  /** RF-IAM-14: papel que mexe com dinheiro, integrações ou membros. */
  readonly requiresMfa: boolean;
}

/** Permissões de sistema da Clerk (`org:sys_*`) — já existem em toda instância. */
export const CLERK_SYSTEM_PERMISSIONS = {
  readMembers: 'org:sys_memberships:read',
  manageMembers: 'org:sys_memberships:manage',
  manageProfile: 'org:sys_profile:manage',
} as const;

/**
 * Papel padrão da Clerk. Continua aceito nas duas organizações — é o
 * "creator role" do role set padrão, o papel de quem cria a organização — e
 * detém todas as permissões (ver `assertPermission`). Por isso exige MFA.
 */
export const CLERK_ADMIN_ROLE = 'org:admin';

export const PANEL_PERMISSIONS: readonly PanelPermission[] = [
  // organização do tenant
  {
    key: 'org:settings:read',
    name: 'Ver configurações',
    description: 'Tema, auditoria e configurações da loja.',
  },
  {
    key: 'org:settings:manage',
    name: 'Alterar configurações',
    description: 'Tema, marca e configurações da loja.',
  },
  {
    key: 'org:integrations:manage',
    name: 'Gerenciar integrações',
    description: 'Gateways, frete, fiscal e credenciais.',
  },
  {
    key: 'org:catalog:moderate',
    name: 'Moderar catálogo',
    description: 'Aprovar e reprovar produtos dos sellers.',
  },
  { key: 'org:sellers:review', name: 'Avaliar sellers', description: 'Aprovar, suspender e revisar lojas.' },
  { key: 'org:orders:read', name: 'Ver pedidos', description: 'Consultar pedidos do marketplace.' },
  {
    key: 'org:orders:support',
    name: 'Atender pedidos',
    description: 'Intervir em pedidos pelo atendimento.',
  },
  { key: 'org:finance:read', name: 'Ver financeiro', description: 'Extratos, saldos e repasses.' },
  { key: 'org:finance:manage', name: 'Operar financeiro', description: 'Ajustes, estornos e repasses.' },
  // organização do seller
  { key: 'org:catalog:read', name: 'Ver catálogo', description: 'Consultar produtos da própria loja.' },
  {
    key: 'org:catalog:manage',
    name: 'Gerenciar catálogo',
    description: 'Criar e editar produtos da própria loja.',
  },
  { key: 'org:offers:manage', name: 'Gerenciar ofertas', description: 'Preço e estoque das ofertas.' },
  {
    key: 'org:orders:manage',
    name: 'Gerenciar pedidos',
    description: 'Aceitar, preparar e cancelar pedidos.',
  },
  { key: 'org:shipping:manage', name: 'Gerenciar envios', description: 'Etiquetas e rastreio.' },
  { key: 'org:bank:manage', name: 'Dados bancários', description: 'Conta de recebimento do seller.' },
  {
    key: 'org:store:manage',
    name: 'Perfil da loja',
    description: 'Nome, logo e políticas da loja do seller.',
  },
];

const { readMembers, manageMembers, manageProfile } = CLERK_SYSTEM_PERMISSIONS;

export const PANEL_ROLES: readonly PanelRole[] = [
  {
    key: 'org:tenant_admin',
    kind: 'tenant',
    name: 'Administrador do marketplace',
    description: 'Todas as permissões do tenant, inclusive integrações e equipe.',
    permissions: [
      'org:settings:read',
      'org:settings:manage',
      'org:integrations:manage',
      'org:catalog:moderate',
      'org:sellers:review',
      'org:orders:read',
      'org:orders:support',
      'org:finance:read',
      'org:finance:manage',
      readMembers,
      manageMembers,
      manageProfile,
    ],
    requiresMfa: true,
  },
  {
    key: 'org:tenant_moderation',
    kind: 'tenant',
    name: 'Moderação',
    description: 'Modera catálogo e avalia sellers.',
    permissions: ['org:catalog:moderate', 'org:sellers:review', readMembers],
    requiresMfa: false,
  },
  {
    key: 'org:tenant_support',
    kind: 'tenant',
    name: 'Atendimento',
    description: 'Consulta e atende pedidos.',
    permissions: ['org:orders:read', 'org:orders:support', readMembers],
    requiresMfa: false,
  },
  {
    key: 'org:tenant_finance',
    kind: 'tenant',
    name: 'Financeiro',
    description: 'Extratos, repasses e ajustes financeiros.',
    permissions: ['org:finance:read', 'org:finance:manage', 'org:orders:read', readMembers],
    requiresMfa: true,
  },
  {
    key: 'org:seller_owner',
    kind: 'seller',
    name: 'Dono da loja',
    description: 'Todas as permissões do seller, inclusive dados bancários e equipe.',
    permissions: [
      'org:catalog:read',
      'org:catalog:manage',
      'org:offers:manage',
      'org:orders:manage',
      'org:shipping:manage',
      'org:finance:read',
      'org:bank:manage',
      'org:store:manage',
      readMembers,
      manageMembers,
      manageProfile,
    ],
    requiresMfa: true,
  },
  {
    key: 'org:seller_catalog',
    kind: 'seller',
    name: 'Catálogo',
    description: 'Produtos e ofertas da loja.',
    permissions: ['org:catalog:read', 'org:catalog:manage', 'org:offers:manage', readMembers],
    requiresMfa: false,
  },
  {
    key: 'org:seller_orders',
    kind: 'seller',
    name: 'Pedidos',
    description: 'Pedidos e envios da loja.',
    permissions: ['org:catalog:read', 'org:orders:manage', 'org:shipping:manage', readMembers],
    requiresMfa: false,
  },
  {
    key: 'org:seller_finance',
    kind: 'seller',
    name: 'Financeiro da loja',
    description: 'Extrato e saldo da loja.',
    permissions: ['org:finance:read', readMembers],
    requiresMfa: false,
  },
];

export const findPanelRole = (key: string): PanelRole | undefined =>
  PANEL_ROLES.find((role) => role.key === key);

/** O papel vale nesta organização? `org:admin` vale nas duas; papel de outro tipo, não. */
export function isRoleAllowedFor(role: string, kind: OrganizationKind): boolean {
  if (role === CLERK_ADMIN_ROLE) return true;
  return findPanelRole(role)?.kind === kind;
}

/** RF-IAM-14: o papel exige segundo fator verificado na sessão. */
export function roleRequiresMfa(role: string): boolean {
  if (role === CLERK_ADMIN_ROLE) return true;
  return findPanelRole(role)?.requiresMfa ?? false;
}
