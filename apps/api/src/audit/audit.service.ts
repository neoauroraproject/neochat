import { Inject, Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import type { Database } from "../database/drizzle.js";
import { adminAuditLog } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(input: AuditInput): Promise<void> {
    await this.db.insert(adminAuditLog).values({
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: (input.metadata ?? null) as never,
      ip: input.ip ?? null,
    });
  }

  async list(limit = 100) {
    return this.db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
  }
}
