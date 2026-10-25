import { Module } from "@nestjs/common";
import { JobTrackerModule } from "../jobs/job-tracker.module.js";
import { PluginLoaderModule } from "../plugin-loader/plugin-loader.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [PluginLoaderModule, JobTrackerModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
