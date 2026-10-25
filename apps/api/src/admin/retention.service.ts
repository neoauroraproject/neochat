import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { UpsertRetentionPolicyRequest } from "@neochat/shared";
import type { Database } from "../database/drizzle.js";
import { retentionPolicies } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";

@Injectable()
export class RetentionService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list() {
    const rows = await this.db.select().from(retentionPolicies);
    return rows.map((r) => this.toDto(r));
  }

  async upsert(input: UpsertRetentionPolicyRequest) {
    const [existing] = await this.db
      .select()
      .from(retentionPolicies)
      .where(
        and(
          eq(retentionPolicies.scope, input.scope),
          eq(retentionPolicies.chatType, input.chatType),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(retentionPolicies)
        .set({
          maxAgeDays: input.maxAgeDays ?? null,
          enabled: input.enabled,
          updatedAt: new Date(),
        })
        .where(eq(retentionPolicies.id, existing.id))
        .returning();
      return this.toDto(row!);
    }

    const [row] = await this.db
      .insert(retentionPolicies)
      .values({
        scope: input.scope,
        chatType: input.chatType,
        maxAgeDays: input.maxAgeDays ?? null,
        enabled: input.enabled,
      })
      .returning();
    return this.toDto(row!);
  }

  private toDto(row: typeof retentionPolicies.$inferSelect) {
    return {
      id: row.id,
      scope: row.scope,
      chatType: row.chatType,
      maxAgeDays: row.maxAgeDays,
      enabled: row.enabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
