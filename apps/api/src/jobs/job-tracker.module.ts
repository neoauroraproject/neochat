import { Module } from "@nestjs/common";
import { JobTrackerService } from "./job-tracker.service.js";

@Module({
  providers: [JobTrackerService],
  exports: [JobTrackerService],
})
export class JobTrackerModule {}
