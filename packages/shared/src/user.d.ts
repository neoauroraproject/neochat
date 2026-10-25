import { z } from "zod";
export declare const UserRoleSchema: z.ZodEnum<["user", "admin"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export declare const UserStatusSchema: z.ZodEnum<["active", "suspended", "deleted"]>;
export type UserStatus = z.infer<typeof UserStatusSchema>;
export declare const PublicUserSchema: z.ZodObject<
  {
    id: z.ZodString;
    username: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    bio: z.ZodNullable<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    username: string;
    displayName: string;
    id: string;
    avatarUrl: string | null;
    bio: string | null;
  },
  {
    username: string;
    displayName: string;
    id: string;
    avatarUrl: string | null;
    bio: string | null;
  }
>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
export declare const UserProfileSchema: z.ZodObject<
  {
    id: z.ZodString;
    username: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodNullable<z.ZodString>;
    bio: z.ZodNullable<z.ZodString>;
  } & {
    role: z.ZodEnum<["user", "admin"]>;
    status: z.ZodEnum<["active", "suspended", "deleted"]>;
    locale: z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>;
    createdAt: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "active" | "suspended" | "deleted";
    username: string;
    displayName: string;
    locale: "en" | "fa" | "ar" | "tr" | "ru";
    role: "user" | "admin";
    id: string;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
  },
  {
    status: "active" | "suspended" | "deleted";
    username: string;
    displayName: string;
    locale: "en" | "fa" | "ar" | "tr" | "ru";
    role: "user" | "admin";
    id: string;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
  }
>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export declare const UpdateProfileRequestSchema: z.ZodObject<
  {
    displayName: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    locale: z.ZodOptional<z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>>;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    displayName?: string | undefined;
    locale?: "en" | "fa" | "ar" | "tr" | "ru" | undefined;
    avatarUrl?: string | null | undefined;
    bio?: string | null | undefined;
  },
  {
    displayName?: string | undefined;
    locale?: "en" | "fa" | "ar" | "tr" | "ru" | undefined;
    avatarUrl?: string | null | undefined;
    bio?: string | null | undefined;
  }
>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export declare const DeviceSchema: z.ZodObject<
  {
    id: z.ZodString;
    name: z.ZodString;
    publicKey: z.ZodNullable<z.ZodString>;
    lastSeenAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    current: z.ZodDefault<z.ZodBoolean>;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    createdAt: string;
    name: string;
    publicKey: string | null;
    lastSeenAt: string | null;
    current: boolean;
  },
  {
    id: string;
    createdAt: string;
    name: string;
    publicKey: string | null;
    lastSeenAt: string | null;
    current?: boolean | undefined;
  }
>;
export type Device = z.infer<typeof DeviceSchema>;
//# sourceMappingURL=user.d.ts.map
