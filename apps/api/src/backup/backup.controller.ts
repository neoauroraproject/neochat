import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  CreateBackupRequestSchema,
  RestoreBackupRequestSchema,
  UpdateBackupScheduleRequestSchema,
  type CreateBackupRequest,
  type RestoreBackupRequest,
  type UpdateBackupScheduleRequest,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type BackupService } from "./backup.service.js";

@Controller("admin/backup")
@Roles("server_admin")
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post("create")
  create(
    @Body(new ZodValidationPipe(CreateBackupRequestSchema)) body: CreateBackupRequest,
    @CurrentUser("sub") actorId: string,
  ) {
    return this.backup.create(body, actorId);
  }

  @Get()
  list() {
    return this.backup.list();
  }

  @Post("restore")
  restore(
    @Body(new ZodValidationPipe(RestoreBackupRequestSchema)) body: RestoreBackupRequest,
    @CurrentUser("sub") actorId: string,
  ) {
    return this.backup.restore(body.backupId, actorId);
  }

  @Get("schedule")
  getSchedule() {
    return this.backup.getSchedule();
  }

  @Post("schedule")
  updateSchedule(
    @Body(new ZodValidationPipe(UpdateBackupScheduleRequestSchema))
    body: UpdateBackupScheduleRequest,
    @CurrentUser("sub") actorId: string,
  ) {
    return this.backup.updateSchedule(body, actorId);
  }
}
