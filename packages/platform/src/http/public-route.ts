import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'mkt:public-route';

/**
 * Declara que a rota **não** exige credencial de usuário (RNF-SEG-03).
 *
 * Existe para que "sem guard" nunca seja o padrão silencioso: o teste de
 * cobertura de guards falha em qualquer rota que não declare quem pode
 * chamá-la, e rota aberta precisa dizer por quê — o motivo fica no código,
 * onde a revisão enxerga (ex.: "webhook: a assinatura do provedor é a
 * credencial", "vitrine: o tenant vem do host").
 */
export const Public = (reason: string): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, reason);
