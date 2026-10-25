import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/roles.decorator.js";
import { type SystemService } from "./system.service.js";

@Controller("system")
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Public()
  @Get()
  info() {
    return this.system.info();
  }
}
