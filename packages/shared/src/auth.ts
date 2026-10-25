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
  rememberMe: z.boolean().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  displayName: z.string().min(1).max(120),
  inviteCode: z.string().optional(),
  locale: LocaleSchema.optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: isoDate,
  refreshTokenExpiresAt: isoDate,
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AuthSessionSchema = z.object({
  userId: uuid,
  deviceId: uuid,
  sessionId: uuid,
  tokens: TokenPairSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const JwtAccessClaimsSchema = z.object({
  sub: uuid,
  sid: uuid,
  did: uuid,
  role: z.enum(["user", "admin"]),
  typ: z.literal("access"),
});
export type JwtAccessClaims = z.infer<typeof JwtAccessClaimsSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const SessionInfoSchema = z.object({
  id: uuid,
  deviceId: uuid,
  deviceName: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: isoDate,
  lastUsedAt: isoDate,
  current: z.boolean(),
  trusted: z.boolean().optional(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const TrustDeviceRequestSchema = z.object({
  password: PasswordSchema,
});
export type TrustDeviceRequest = z.infer<typeof TrustDeviceRequestSchema>;
