import { Controller, Get } from '@nestjs/common';

import { PANEL_ACCESS_PERMISSION } from '@mkt/contracts';
import { PanelAuth, Requires } from '@mkt/modules-identity';
import { requireTenant } from '@mkt/platform';

import { PanelBrandingService, type PanelBranding } from '../application/panel-branding.js';

/**
 * Marca do tenant da organização ativa, para o cabeçalho dos painéis
 * (RF-IAM-15). O tenant vem da organização — o painel não escolhe nada.
 */
@Controller('admin/branding')
@PanelAuth('tenant')
@Requires(PANEL_ACCESS_PERMISSION)
export class AdminBrandingController {
  constructor(private readonly branding: PanelBrandingService) {}

  @Get()
  get(): Promise<PanelBranding> {
    return this.branding.forTenant(requireTenant());
  }
}

/** O seller vê a marca do marketplace em que vende. */
@Controller('seller/branding')
@PanelAuth('seller')
@Requires(PANEL_ACCESS_PERMISSION)
export class SellerBrandingController {
  constructor(private readonly branding: PanelBrandingService) {}

  @Get()
  get(): Promise<PanelBranding> {
    return this.branding.forTenant(requireTenant());
  }
}
