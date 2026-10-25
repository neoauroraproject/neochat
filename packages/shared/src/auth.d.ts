import { z } from "zod";
export declare const UsernameSchema: z.ZodString;
export declare const PasswordSchema: z.ZodString;
export declare const LoginRequestSchema: z.ZodObject<
  {
    username: z.ZodString;
    password: z.ZodString;
    deviceName: z.ZodOptional<z.ZodString>;
    devicePublicKey: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    username: string;
    password: string;
    deviceName?: string | undefined;
    devicePublicKey?: string | undefined;
  },
  {
    username: string;
    password: string;
    deviceName?: string | undefined;
    devicePublicKey?: string | undefined;
  }
>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export declare const RegisterRequestSchema: z.ZodObject<
  {
    username: z.ZodString;
    password: z.ZodString;
    displayName: z.ZodString;
    inviteCode: z.ZodOptional<z.ZodString>;
    locale: z.ZodOptional<z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    username: string;
    password: string;
    displayName: string;
    inviteCode?: string | undefined;
    locale?: "en" | "fa" | "ar" | "tr" | "ru" | undefined;
  },
  {
    username: string;
    password: string;
    displayName: string;
    inviteCode?: string | undefined;
    locale?: "en" | "fa" | "ar" | "tr" | "ru" | undefined;
  }
>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export declare const RefreshRequestSchema: z.ZodObject<
  {
    refreshToken: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    refreshToken: string;
  },
  {
    refreshToken: string;
  }
>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export declare const TokenPairSchema: z.ZodObject<
  {
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    accessTokenExpiresAt: z.ZodString;
    refreshTokenExpiresAt: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    refreshToken: string;
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  },
  {
    refreshToken: string;
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  }
>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
export declare const AuthSessionSchema: z.ZodObject<
  {
    userId: z.ZodString;
    deviceId: z.ZodString;
    sessionId: z.ZodString;
    tokens: z.ZodObject<
      {
        accessToken: z.ZodString;
        refreshToken: z.ZodString;
        accessTokenExpiresAt: z.ZodString;
        refreshTokenExpiresAt: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        refreshToken: string;
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshTokenExpiresAt: string;
      },
      {
        refreshToken: string;
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshTokenExpiresAt: string;
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    userId: string;
    deviceId: string;
    sessionId: string;
    tokens: {
      refreshToken: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    };
  },
  {
    userId: string;
    deviceId: string;
    sessionId: string;
    tokens: {
      refreshToken: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    };
  }
>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export declare const JwtAccessClaimsSchema: z.ZodObject<
  {
    sub: z.ZodString;
    sid: z.ZodString;
    did: z.ZodString;
    role: z.ZodEnum<["user", "admin"]>;
    typ: z.ZodLiteral<"access">;
  },
  "strip",
  z.ZodTypeAny,
  {
    sub: string;
    sid: string;
    did: string;
    role: "user" | "admin";
    typ: "access";
  },
  {
    sub: string;
    sid: string;
    did: string;
    role: "user" | "admin";
    typ: "access";
  }
>;
export type JwtAccessClaims = z.infer<typeof JwtAccessClaimsSchema>;
//# sourceMappingURL=auth.d.ts.map
