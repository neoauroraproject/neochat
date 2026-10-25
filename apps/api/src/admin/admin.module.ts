import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { HealthModule } from "../health/health.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { RetentionService } from "./retention.service.js";

@Module({
  imports: [AuditModule, HealthModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService, RetentionService],
})
export class AdminModule {}
