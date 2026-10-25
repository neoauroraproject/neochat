import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { type Reflector } from "@nestjs/core";
import { type JwtService } from "@nestjs/jwt";
import { JwtAccessClaimsSchema } from "@neochat/shared";
import { type ConfigurationService } from "../config/configuration.service.js";
import { PUBLIC_KEY, ROLES_KEY, type AppRole } from "./roles.decorator.js";

function roleMatches(required: AppRole, userRole: "user" | "admin"): boolean {
  if (required === "server_admin") return userRole === "admin";
  return required === userRole;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigurationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = req.headers["authorization"] ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Missing bearer token");

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.cfg.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const claims = JwtAccessClaimsSchema.safeParse(payload);
    if (!claims.success) throw new UnauthorizedException("Malformed token claims");
    req.user = claims.data;

    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.some((r) => roleMatches(r, claims.data.role))) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
