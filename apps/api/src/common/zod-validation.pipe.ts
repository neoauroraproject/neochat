import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/** Validates & narrows request payloads against a Zod schema. */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        error: "ValidationError",
        code: "validation_failed",
      });
    }
    return result.data;
  }
}
