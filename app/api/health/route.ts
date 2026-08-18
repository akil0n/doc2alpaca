import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 存活探针（liveness）：只证明进程能响应，不依赖数据库/Redis/RabbitMQ。
 * 供 Docker healthcheck 与负载均衡器使用。
 * 就绪探针（readiness，检查下游依赖）在 P5 可观测性阶段补充。
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "doc2alpaca",
    uptime: Math.round(process.uptime()),
  });
}
