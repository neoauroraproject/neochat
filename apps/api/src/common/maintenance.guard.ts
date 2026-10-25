import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { type Reflector } from "@nestjs/core";
import type { JwtAccessClaims } from "@neochat/shared";
import { type ConfigurationService } from "../config/configuration.service.js";
import { PUBLIC_KEY } from "./roles.decorator.js";

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cfg: ConfigurationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.cfg.get("general").maintenanceMode) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessClaims; path?: string; url?: string }>();
    const path = req.path ?? req.url ?? "";
    if (path.includes("/admin")) return true;

    const user = req.user;
    if (user?.role === "admin") return true;

    throw new ServiceUnavailableException({
      statusCode: 503,
      message: this.cfg.get("general").maintenanceMessage,
      maintenanceMode: true,
    });
  }
}
