import { z } from "zod";
import { LocaleSchema, uuid, isoDate } from "./common.js";
export const UsernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "username may only contain letters, numbers, _ . -");
export const PasswordSchema = z.string().min(10).max(256);
export const LoginRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  deviceName: z.string().max(120).optional(),
  devicePublicKey: z.string().optional(),
});
export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  displayName: z.string().min(1).max(120),
  inviteCode: z.string().optional(),
  locale: LocaleSchema.optional(),
});
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: isoDate,
  refreshTokenExpiresAt: isoDate,
});
export const AuthSessionSchema = z.object({
  userId: uuid,
  deviceId: uuid,
  sessionId: uuid,
  tokens: TokenPairSchema,
});
export const JwtAccessClaimsSchema = z.object({
  sub: uuid,
  sid: uuid,
  did: uuid,
  role: z.enum(["user", "admin"]),
  typ: z.literal("access"),
});
//# sourceMappingURL=auth.js.map
