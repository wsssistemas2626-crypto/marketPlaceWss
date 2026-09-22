import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@mkt/shared-kernel';

import { ProblemDetailsFilter } from '../src/http/problem-details.filter.js';
import { TenantNotFoundError, TenantSuspendedError } from '../src/tenancy/tenant-errors.js';

function capture(exception: unknown, url = '/v1/store/products') {
  const json = vi.fn();
  const setHeader = vi.fn();
  const response = { status: vi.fn().mockReturnThis(), setHeader, json };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url }) }),
  } as unknown as ArgumentsHost;

  new ProblemDetailsFilter().catch(exception, host);

  return { body: json.mock.calls[0]?.[0] as Record<string, unknown>, response, setHeader };
}

describe('ProblemDetailsFilter', () => {
  it('usa o status do erro de tenancy e o formato RFC 9457', () => {
    const { body, response, setHeader } = capture(new TenantNotFoundError());

    expect(response.status).toHaveBeenCalledWith(404);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(body).toMatchObject({
      type: 'https://errors.marketplace/tenant_not_found',
      status: 404,
      code: 'tenant_not_found',
      instance: '/v1/store/products',
    });
  });

  it('inclui os detalhes do erro de domínio', () => {
    const { body } = capture(new TenantSuspendedError('loja-c'));

    expect(body).toMatchObject({ status: 403, code: 'tenant_suspended', slug: 'loja-c' });
  });

  it('mapeia códigos de domínio para status HTTP', () => {
    expect(capture(new ValidationError('campo inválido', { field: 'email' })).body).toMatchObject({
      status: 422,
      code: 'validation_error',
      field: 'email',
    });
  });

  it('preserva o status de HttpException', () => {
    expect(capture(new HttpException('Cannot GET', 404)).body).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(capture(new HttpException('sem permissão', 403)).body).toMatchObject({
      status: 403,
      code: 'http_error',
    });
  });

  it('não vaza detalhe de erro inesperado', () => {
    const { body } = capture(new Error('senha do banco no stack trace'));

    expect(body).toMatchObject({ status: 500, code: 'internal_error', title: 'Erro interno' });
    expect(JSON.stringify(body)).not.toContain('senha');
  });

  it('funciona sem url na requisição', () => {
    const json = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), setHeader: vi.fn(), json };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => undefined }),
    } as unknown as ArgumentsHost;

    new ProblemDetailsFilter().catch('falha sem objeto Error', host);

    expect(json.mock.calls[0]?.[0]).toMatchObject({ status: 500 });
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty('instance');
  });
});
