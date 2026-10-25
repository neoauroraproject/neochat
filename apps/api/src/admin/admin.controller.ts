import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ConfigCategory } from "@neochat/config";
import {
  CreateInviteRequestSchema,
  UpdateConfigRequestSchema,
  UpdateFeatureFlagRequestSchema,
  UpdateTlsConfigRequestSchema,
  UpdateUserAdminRequestSchema,
  UpsertRetentionPolicyRequestSchema,
  type CreateInviteRequest,
  type UpdateConfigRequest,
  type UpdateFeatureFlagRequest,
  type UpdateTlsConfigRequest,
  type UpdateUserAdminRequest,
  type UpsertRetentionPolicyRequest,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { Roles } from "../common/roles.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type HealthService } from "../health/health.service.js";
import { type AdminService } from "./admin.service.js";
import { type RetentionService } from "./retention.service.js";
import { type UsersService } from "../users/users.service.js";

function meta(req: { ip?: string }) {
  return req.ip;
}

@Controller("admin")
@Roles("server_admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly retention: RetentionService,
    private readonly health: HealthService,
    private readonly users: UsersService,
  ) {}

  @Get("users")
  listUsers(@Query("limit") limit?: string) {
    return this.users.listForAdmin(limit ? Number(limit) : undefined);
  }

  @Patch("users/:id")
  patchUser(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserAdminRequestSchema)) body: UpdateUserAdminRequest,
  ) {
    return this.users.updateForAdmin(id, body);
  }

  @Post("users/:id/revoke-sessions")
  revokeUserSessions(@Param("id") id: string) {
    return this.users.revokeAllSessionsForAdmin(id);
  }
  @Get("diagnostics")
  diagnostics() {
    return this.health.diagnostics();
  }

  @Get("config")
  listConfig(@Query("category") category?: ConfigCategory) {
    return category ? this.admin.listConfig(category) : this.admin.listConfig();
  }

  @Patch("config/:category/:key")
  patchConfig(
    @Param("category") category: ConfigCategory,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(UpdateConfigRequestSchema)) body: UpdateConfigRequest,
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.patchConfig(category, key, body.value, actorId, meta(req));
  }

  @Get("feature-flags")
  listFeatureFlags() {
    return this.admin.listFeatureFlags();
  }

  @Patch("feature-flags/:key")
  patchFeatureFlag(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(UpdateFeatureFlagRequestSchema)) body: UpdateFeatureFlagRequest,
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.patchFeatureFlag(key, body, actorId, meta(req));
  }

  @Get("audit")
  listAudit(@Query("limit") limit?: string) {
    return this.admin.listAudit(limit ? Number(limit) : undefined);
  }

  @Post("invites")
  createInvite(
    @Body(new ZodValidationPipe(CreateInviteRequestSchema)) body: CreateInviteRequest,
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.createInvite(body, actorId, meta(req));
  }

  @Get("invites")
  listInvites() {
    return this.admin.listInvites();
  }

  @Delete("invites/:id")
  revokeInvite(
    @Param("id") id: string,
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.revokeInvite(id, actorId, meta(req));
  }

  @Get("retention")
  listRetention() {
    return this.retention.list();
  }

  @Patch("retention")
  upsertRetention(
    @Body(new ZodValidationPipe(UpsertRetentionPolicyRequestSchema))
    body: UpsertRetentionPolicyRequest,
  ) {
    return this.retention.upsert(body);
  }

  @Get("tls")
  getTls() {
    return this.admin.getTlsConfig();
  }

  @Post("tls")
  updateTls(
    @Body(new ZodValidationPipe(UpdateTlsConfigRequestSchema)) body: UpdateTlsConfigRequest,
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.updateTlsConfig(body, actorId, meta(req));
  }

  @Get("permissions/templates")
  permissionTemplates() {
    return this.admin.getPermissionTemplates();
  }

  @Get("maintenance")
  getMaintenance() {
    return this.admin.getMaintenance();
  }

  @Post("maintenance")
  setMaintenance(
    @Body() body: { enabled: boolean },
    @CurrentUser("sub") actorId: string,
    @Req() req: { ip?: string },
  ) {
    return this.admin.setMaintenanceMode(body.enabled, actorId, meta(req));
  }
}
