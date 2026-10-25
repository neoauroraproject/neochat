import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { JwtAccessClaims } from "@neochat/shared";

export interface AuthenticatedRequest extends Request {
  user?: JwtAccessClaims;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtAccessClaims | undefined, ctx: ExecutionContext): JwtAccessClaims | unknown => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtAccessClaims }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
