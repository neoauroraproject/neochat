import { Module } from "@nestjs/common";
import { BackupModule } from "../backup/backup.module.js";
import { JobTrackerModule } from "./job-tracker.module.js";
import { ScheduledJobsService } from "./scheduled-jobs.service.js";

@Module({
  imports: [JobTrackerModule, BackupModule],
  providers: [ScheduledJobsService],
  exports: [JobTrackerModule],
})
export class JobsModule {}
