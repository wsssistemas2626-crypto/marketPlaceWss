import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';

import { PanelAuth, Requires } from '@mkt/modules-identity';
import { Public, requireTenant } from '@mkt/platform';
import { SystemClock, ValidationError } from '@mkt/shared-kernel';

import { ThemeService } from '../application/theme-service.js';
import { themeToCssVariables, type Theme } from '../domain/theme.js';

interface ThemeResponse {
  readonly theme: Theme;
  readonly cssVariables: Record<string, string>;
}

const toResponse = (theme: Theme): ThemeResponse => ({
  theme,
  cssVariables: themeToCssVariables(theme),
});

/** Edição do tema pelo admin do tenant (RF-TEN-04). */
@Controller('admin/theme')
@PanelAuth('tenant')
export class AdminThemeController {
  private readonly clock = new SystemClock();

  constructor(private readonly themes: ThemeService) {}

  /** Rascunho — é o que a tela de personalização mostra e o preview usa. */
  @Get()
  @Requires('org:settings:read')
  async draft(): Promise<ThemeResponse> {
    return toResponse(await this.themes.getDraft(requireTenant().tenantId));
  }

  @Put()
  @Requires('org:settings:manage')
  async saveDraft(@Body() body: unknown): Promise<ThemeResponse> {
    try {
      return toResponse(await this.themes.saveDraft(requireTenant().tenantId, body));
    } catch (error) {
      // erro do schema vira validação de campo, não 500
      const detail = error instanceof Error ? error.message : 'tema inválido';
      throw new ValidationError('Tema inválido', { detail: detail.slice(0, 200) });
    }
  }

  /** Publica o rascunho: é só aqui que a loja muda de cara. */
  @Post('publish')
  @HttpCode(200)
  @Requires('org:settings:manage')
  async publish(): Promise<ThemeResponse> {
    return toResponse(await this.themes.publish(requireTenant().tenantId, this.clock.now()));
  }

  @Post('discard')
  @HttpCode(200)
  @Requires('org:settings:manage')
  async discard(): Promise<ThemeResponse> {
    return toResponse(await this.themes.discardDraft(requireTenant().tenantId));
  }
}

/**
 * Tema que a loja serve (público, sem autenticação — o tenant vem do host).
 * O storefront chama isto no servidor e injeta as variáveis CSS.
 */
@Controller('store/theme')
@Public('vitrine: o tema publicado é público e o tenant vem do host')
export class StoreThemeController {
  constructor(private readonly themes: ThemeService) {}

  @Get()
  async published(): Promise<ThemeResponse> {
    return toResponse(await this.themes.getPublished(requireTenant().tenantId));
  }
}
