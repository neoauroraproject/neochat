import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuditModule } from "../audit/audit.module.js";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module.js";
import { SecurityModule } from "../security/security.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [JwtModule.register({}), AuditModule, FeatureFlagsModule, SecurityModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
