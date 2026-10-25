import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { KeyBundle, PublishKeysRequest } from "@neochat/shared";
import type { Database } from "../database/drizzle.js";
import { deviceKeys, devices, oneTimePrekeys, signedPrekeys } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";

@Injectable()
export class KeysService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async publish(userId: string, input: PublishKeysRequest): Promise<{ ok: true }> {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, input.deviceId), eq(devices.userId, userId)))
      .limit(1);
    if (!device) throw new ForbiddenException("Device not found");

    await this.db
      .insert(deviceKeys)
      .values({
        deviceId: input.deviceId,
        userId,
        identityKey: input.identityKey,
        signingKey: input.signingKey,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: deviceKeys.deviceId,
        set: {
          identityKey: input.identityKey,
          signingKey: input.signingKey,
          updatedAt: new Date(),
        },
      });

    await this.db
      .insert(signedPrekeys)
      .values({
        deviceId: input.deviceId,
        keyId: input.signedPreKey.keyId,
        publicKey: input.signedPreKey.publicKey,
        signature: input.signedPreKey.signature,
      })
      .onConflictDoUpdate({
        target: [signedPrekeys.deviceId, signedPrekeys.keyId],
        set: {
          publicKey: input.signedPreKey.publicKey,
          signature: input.signedPreKey.signature,
        },
      });

    if (input.oneTimePreKeys.length > 0) {
      await this.db
        .insert(oneTimePrekeys)
        .values(
          input.oneTimePreKeys.map((k) => ({
            deviceId: input.deviceId,
            keyId: k.keyId,
            publicKey: k.publicKey,
          })),
        )
        .onConflictDoNothing();
    }

    return { ok: true };
  }

  async getBundle(userId: string, deviceId: string): Promise<KeyBundle> {
    const [keys] = await this.db
      .select()
      .from(deviceKeys)
      .where(and(eq(deviceKeys.deviceId, deviceId), eq(deviceKeys.userId, userId)))
      .limit(1);
    if (!keys) throw new NotFoundException("Key bundle not found");

    const [signed] = await this.db
      .select()
      .from(signedPrekeys)
      .where(eq(signedPrekeys.deviceId, deviceId))
      .limit(1);
    if (!signed) throw new NotFoundException("Signed prekey not found");

    const otps = await this.db
      .select()
      .from(oneTimePrekeys)
      .where(and(eq(oneTimePrekeys.deviceId, deviceId), isNull(oneTimePrekeys.consumedAt)))
      .limit(20);

    if (otps.length > 0) {
      const first = otps[0]!;
      await this.db
        .update(oneTimePrekeys)
        .set({ consumedAt: new Date() })
        .where(eq(oneTimePrekeys.id, first.id));
    }

    return {
      identityKey: keys.identityKey,
      signingKey: keys.signingKey,
      signedPreKey: {
        keyId: signed.keyId,
        publicKey: signed.publicKey,
        signature: signed.signature,
      },
      oneTimePreKeys: otps.map((k) => ({ keyId: k.keyId, publicKey: k.publicKey })),
    };
  }

  async listDeviceBundles(
    targetUserId: string,
  ): Promise<Array<{ deviceId: string; bundle: KeyBundle }>> {
    const deviceRows = await this.db.select().from(devices).where(eq(devices.userId, targetUserId));
    const bundles: Array<{ deviceId: string; bundle: KeyBundle }> = [];
    for (const device of deviceRows) {
      try {
        const bundle = await this.getBundle(targetUserId, device.id);
        bundles.push({ deviceId: device.id, bundle });
      } catch {
        // Skip devices without published keys.
      }
    }
    return bundles;
  }
}
