import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { PluginLoaderModule } from "../plugin-loader/plugin-loader.module.js";
import { PluginHostController } from "./plugin-host.controller.js";
import { PluginHostService } from "./plugin-host.service.js";

@Module({
  imports: [PluginLoaderModule, AuditModule],
  controllers: [PluginHostController],
  providers: [PluginHostService],
  exports: [PluginHostService],
})
export class PluginHostModule {}
