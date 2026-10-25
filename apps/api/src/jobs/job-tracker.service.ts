import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { type Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";

export interface JobRunRecord {
  name: string;
  lastRunAt: string | null;
  lastStatus: "ok" | "failed" | "never";
  detail?: string;
}

@Injectable()
export class JobTrackerService {
  private readonly prefix = "jobs:last-run:";

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async record(name: string, status: "ok" | "failed", detail?: string): Promise<void> {
    const payload: JobRunRecord = {
      name,
      lastRunAt: new Date().toISOString(),
      lastStatus: status,
      detail,
    };
    await this.redis.set(this.prefix + name, JSON.stringify(payload));
  }

  async get(name: string): Promise<JobRunRecord> {
    const raw = await this.redis.get(this.prefix + name);
    if (!raw) {
      return { name, lastRunAt: null, lastStatus: "never" };
    }
    return JSON.parse(raw) as JobRunRecord;
  }

  async list(names: string[]): Promise<JobRunRecord[]> {
    return Promise.all(names.map((name) => this.get(name)));
  }
}
