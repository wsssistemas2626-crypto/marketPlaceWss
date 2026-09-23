import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { DATABASE_POOL, TenantAwareRepository, type DatabasePool } from '@mkt/platform';

import type { CustomerAddressRepositoryPort } from '../application/customers/customer-addresses.js';
import type { AddressSnapshot } from '../domain/customer/address.js';
import { customerAddresses } from './identity.schema.js';

type Row = typeof customerAddresses.$inferSelect;

const toSnapshot = (row: Row): AddressSnapshot => ({
  id: row.id,
  customerId: row.customerId,
  ...(row.label === null ? {} : { label: row.label }),
  recipientName: row.recipientName,
  zipCode: row.zipCode,
  street: row.street,
  number: row.number,
  ...(row.complement === null ? {} : { complement: row.complement }),
  district: row.district,
  city: row.city,
  state: row.state,
  isDefault: row.isDefault,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Endereços no Postgres (US-014). Toda consulta filtra pelo comprador **e**
 * roda com RLS do tenant: endereço de outra pessoa, ou de outra loja, não
 * aparece nem por id.
 */
@Injectable()
export class DrizzleCustomerAddressRepository
  extends TenantAwareRepository
  implements CustomerAddressRepositoryPort
{
  constructor(@Inject(DATABASE_POOL) pool: DatabasePool) {
    super(pool);
  }

  async list(customerId: string): Promise<AddressSnapshot[]> {
    return this.withTenant(async (client) =>
      (
        await drizzle(client)
          .select()
          .from(customerAddresses)
          .where(eq(customerAddresses.customerId, customerId))
      ).map(toSnapshot),
    );
  }

  async find(customerId: string, addressId: string): Promise<AddressSnapshot | undefined> {
    return this.withTenant(async (client) => {
      const [row] = await drizzle(client)
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
        .limit(1);
      return row === undefined ? undefined : toSnapshot(row);
    });
  }

  async save(address: AddressSnapshot): Promise<void> {
    await this.withTenant(async (client) => {
      const database = drizzle(client);

      // um padrão por comprador (índice único parcial): desmarca o anterior antes
      if (address.isDefault) {
        await database
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(
            and(
              eq(customerAddresses.customerId, address.customerId),
              eq(customerAddresses.isDefault, true),
              ne(customerAddresses.id, address.id),
            ),
          );
      }

      const values = {
        tenantId: this.tenantId,
        customerId: address.customerId,
        label: address.label ?? null,
        recipientName: address.recipientName,
        zipCode: address.zipCode,
        street: address.street,
        number: address.number,
        complement: address.complement ?? null,
        district: address.district,
        city: address.city,
        state: address.state,
        isDefault: address.isDefault,
        updatedAt: address.updatedAt,
      };

      await database
        .insert(customerAddresses)
        .values({ ...values, id: address.id, createdAt: address.createdAt })
        .onConflictDoUpdate({ target: customerAddresses.id, set: values });
    });
  }

  async remove(customerId: string, addressId: string): Promise<void> {
    await this.withTenant(async (client) => {
      await drizzle(client)
        .delete(customerAddresses)
        .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)));
    });
  }
}
