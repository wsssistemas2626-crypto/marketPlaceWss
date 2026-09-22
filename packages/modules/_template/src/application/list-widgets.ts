import type { Widget } from '../domain/widget.js';
import type { WidgetRepositoryPort } from './widget-repository.port.js';

const MAX_PAGE_SIZE = 100;

/** Consulta de exemplo — o filtro por tenant é do repositório, não daqui. */
export class ListWidgets {
  constructor(private readonly repository: WidgetRepositoryPort) {}

  async execute(limit = 20): Promise<Widget[]> {
    return this.repository.list(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE));
  }
}
