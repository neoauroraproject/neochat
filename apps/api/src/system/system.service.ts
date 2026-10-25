import { Injectable } from "@nestjs/common";
import { type ConfigurationService } from "../config/configuration.service.js";

const startedAt = Date.now();
const VERSION = "1.0.0-rc.1";

@Injectable()
export class SystemService {
  constructor(private readonly cfg: ConfigurationService) {}

  info() {
    return {
      version: VERSION,
      uptimeSeconds: (Date.now() - startedAt) / 1000,
      instanceName: this.cfg.get("general").instanceName,
      environment: this.cfg.env.NODE_ENV,
    };
  }
}

export { VERSION as APP_VERSION, startedAt as APP_STARTED_AT };
