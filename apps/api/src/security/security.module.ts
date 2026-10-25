import { Module } from "@nestjs/common";
import { BruteForceService } from "./brute-force.service.js";

@Module({
  providers: [BruteForceService],
  exports: [BruteForceService],
})
export class SecurityModule {}
