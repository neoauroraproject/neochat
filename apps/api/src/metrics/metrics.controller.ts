import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../common/roles.decorator.js";
import { APP_STARTED_AT } from "../system/system.service.js";

@Controller()
export class MetricsController {
  @Public()
  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metrics(): string {
    const mem = process.memoryUsage();
    const uptime = (Date.now() - APP_STARTED_AT) / 1000;
    const lines = [
      "# HELP neochat_process_uptime_seconds Process uptime in seconds",
      "# TYPE neochat_process_uptime_seconds gauge",
      `neochat_process_uptime_seconds ${uptime.toFixed(3)}`,
      "# HELP neochat_process_heap_bytes Heap memory usage",
      "# TYPE neochat_process_heap_bytes gauge",
      `neochat_process_heap_bytes ${mem.heapUsed}`,
      "# HELP neochat_process_rss_bytes Resident set size",
      "# TYPE neochat_process_rss_bytes gauge",
      `neochat_process_rss_bytes ${mem.rss}`,
    ];
    return lines.join("\n") + "\n";
  }
}
