import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/roles.decorator.js";
import { type HealthService } from "./health.service.js";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get("health/live")
  live() {
    return this.health.live();
  }

  @Public()
  @Get("health/ready")
  ready() {
    return this.health.ready();
  }

  @Public()
  @Get("health/diagnostics")
  diagnostics() {
    return this.health.diagnostics();
  }
}
