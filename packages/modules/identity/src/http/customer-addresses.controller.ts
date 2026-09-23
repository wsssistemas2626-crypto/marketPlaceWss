import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';

import {
  customerAddressRequest,
  type CustomerAddressResponse,
  type PostalCodeLookupResponse,
} from '@mkt/contracts';
import { Idempotent, RateLimit } from '@mkt/platform';

import { CustomerAddresses } from '../application/customers/customer-addresses.js';
import type { AddressSnapshot } from '../domain/customer/address.js';
import { CurrentCustomer, CustomerAuth, type CustomerSession } from './customer-auth.js';
import { parseBody } from './parse-body.js';

const toResponse = (address: AddressSnapshot): CustomerAddressResponse => ({
  id: address.id,
  ...(address.label === undefined ? {} : { label: address.label }),
  recipientName: address.recipientName,
  zipCode: address.zipCode,
  street: address.street,
  number: address.number,
  ...(address.complement === undefined ? {} : { complement: address.complement }),
  district: address.district,
  city: address.city,
  state: address.state,
  isDefault: address.isDefault,
});

/**
 * Endereços do próprio comprador (US-014 / RF-IAM-09). O dono vem da sessão,
 * nunca do caminho: não existe `/customers/:id/addresses` para trocar o id.
 */
@Controller('store/customers/me/addresses')
@CustomerAuth()
export class CustomerAddressesController {
  constructor(private readonly addresses: CustomerAddresses) {}

  @Get()
  async list(@CurrentCustomer() session: CustomerSession): Promise<{ data: CustomerAddressResponse[] }> {
    return { data: (await this.addresses.list(session.customerId)).map(toResponse) };
  }

  @Post()
  @Idempotent()
  async add(
    @CurrentCustomer() session: CustomerSession,
    @Body() body: unknown,
  ): Promise<CustomerAddressResponse> {
    return toResponse(await this.addresses.add(session.customerId, parseBody(customerAddressRequest, body)));
  }

  @Put(':id')
  async update(
    @CurrentCustomer() session: CustomerSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CustomerAddressResponse> {
    return toResponse(
      await this.addresses.update(session.customerId, id, parseBody(customerAddressRequest, body)),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentCustomer() session: CustomerSession, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(session.customerId, id);
  }
}

/**
 * Autocompletar de CEP. Só para comprador logado, e com limite por cliente:
 * aberta, a rota viraria um proxy grátis do ViaCEP em nome da plataforma.
 */
@Controller('store/postal-codes')
@CustomerAuth()
export class PostalCodesController {
  constructor(private readonly addresses: CustomerAddresses) {}

  @Get()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async lookup(@Query('zipCode') zipCode: string | undefined): Promise<PostalCodeLookupResponse> {
    const address = await this.addresses.lookupPostalCode(zipCode ?? '');
    return address === undefined ? { found: false } : { found: true, address };
  }
}
