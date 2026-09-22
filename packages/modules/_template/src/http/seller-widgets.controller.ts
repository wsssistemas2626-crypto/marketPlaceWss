import { Controller, Get } from '@nestjs/common';

import { PanelAuth, Requires } from '@mkt/modules-identity';

import { ListWidgets } from '../application/list-widgets.js';
import type { WidgetResponse } from './widget.dto.js';

/**
 * Rota de painel do vendedor — existe para exercitar o `@PanelAuth` da US-082
 * ponta a ponta: organização errada é 403 `wrong_organization_kind`, falta de
 * permissão é 403, e o tenant vem do vínculo da organização, não da claim.
 */
@Controller('seller/widgets')
@PanelAuth('seller')
@Requires('org:catalog:read')
export class SellerWidgetsController {
  constructor(private readonly listWidgets: ListWidgets) {}

  @Get()
  async list(): Promise<{ data: WidgetResponse[] }> {
    const widgets = await this.listWidgets.execute(20);

    return {
      data: widgets.map((widget) => {
        const snapshot = widget.toSnapshot();
        return {
          id: snapshot.id,
          slug: snapshot.slug,
          name: snapshot.name,
          priceCents: snapshot.price.cents,
          createdAt: snapshot.createdAt.toISOString(),
        };
      }),
    };
  }
}
