import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UsePipes } from "@nestjs/common";
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  SetupRequestSchema,
  TrustDeviceRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type SetupRequest,
  type TrustDeviceRequest,
} from "@neochat/shared";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Public } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type AuthService } from "./auth.service.js";

function meta(req: { ip?: string; headers: Record<string, string | undefined> }) {
  return { ip: req.ip, userAgent: req.headers["user-agent"] };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get("setup")
  setupStatus() {
    return this.auth.setupStatus();
  }

  @Public()
  @Post("setup")
  @UsePipes(new ZodValidationPipe(SetupRequestSchema))
  runSetup(@Body() body: SetupRequest, @Req() req: any) {
    return this.auth.runSetup(body, meta(req));
  }

  @Public()
  @Post("register")
  @UsePipes(new ZodValidationPipe(RegisterRequestSchema))
  register(@Body() body: RegisterRequest, @Req() req: any) {
    return this.auth.register(body, meta(req));
  }

  @Public()
  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  login(@Body() body: LoginRequest, @Req() req: any) {
    return this.auth.login(body, meta(req));
  }

  @Public()
  @Post("refresh")
  @UsePipes(new ZodValidationPipe(RefreshRequestSchema))
  refresh(@Body() body: RefreshRequest) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post("logout")
  @UsePipes(new ZodValidationPipe(RefreshRequestSchema))
  async logout(@Body() body: RefreshRequest) {
    await this.auth.logout(body.refreshToken);
    return { ok: true };
  }

  @Get("sessions")
  listSessions(@CurrentUser("sub") userId: string, @CurrentUser("sid") sessionId: string) {
    return this.auth.listSessions(userId, sessionId);
  }

  @Delete("sessions/:id")
  revokeSession(
    @CurrentUser("sub") userId: string,
    @CurrentUser("sid") currentSessionId: string,
    @Param("id") sessionId: string,
  ) {
    return this.auth.revokeSession(userId, sessionId, currentSessionId);
  }

  @Post("password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @CurrentUser("sub") userId: string,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
  ) {
    return this.auth.changePassword(userId, body);
  }

  @Post("devices/:id/trust")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  trustDevice(
    @CurrentUser("sub") userId: string,
    @Param("id") deviceId: string,
    @Body(new ZodValidationPipe(TrustDeviceRequestSchema)) body: TrustDeviceRequest,
  ) {
    return this.auth.trustDevice(userId, deviceId, body);
  }
}
