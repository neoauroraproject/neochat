import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { type BackupService } from "../backup/backup.service.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import { type JobTrackerService } from "./job-tracker.service.js";

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    private readonly backup: BackupService,
    private readonly cfg: ConfigurationService,
    private readonly jobs: JobTrackerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async retentionSweep(): Promise<void> {
    try {
      await this.jobs.record("retention.sweep", "ok", "Retention sweep placeholder (no-op)");
    } catch (err) {
      await this.jobs.record("retention.sweep", "failed", String(err));
      this.logger.warn(`Retention sweep failed: ${String(err)}`);
    }
  }

  @Cron("0 3 * * *")
  async scheduledBackup(): Promise<void> {
    const backupCfg = this.cfg.get("backup");
    if (!backupCfg.scheduleEnabled) return;
    try {
      await this.backup.create({ includeDatabase: true });
      await this.jobs.record("backup.scheduled", "ok");
    } catch (err) {
      await this.jobs.record("backup.scheduled", "failed", String(err));
      this.logger.error(`Scheduled backup failed: ${String(err)}`);
    }
  }
}
