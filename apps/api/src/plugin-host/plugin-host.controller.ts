import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UpdatePluginStateRequestSchema, type UpdatePluginStateRequest } from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type PluginHostService } from "./plugin-host.service.js";

@Controller("admin/plugins")
@Roles("server_admin")
export class PluginHostController {
  constructor(private readonly host: PluginHostService) {}

  @Get()
  list() {
    return this.host.status();
  }

  @Patch(":id")
  patch(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdatePluginStateRequestSchema)) body: UpdatePluginStateRequest,
    @CurrentUser("sub") actorId: string,
  ) {
    return this.host.setEnabled(id, body, actorId);
  }
}
