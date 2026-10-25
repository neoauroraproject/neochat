import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { BackupController } from "./backup.controller.js";
import { BackupService } from "./backup.service.js";

@Module({
  imports: [AuditModule],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
