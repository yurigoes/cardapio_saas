import { NextResponse } from "next/server";
import { healthCheck as dbHealthCheck } from "@/lib/db/client";
import { healthCheck as redisHealthCheck } from "@/lib/db/redis";

export async function GET() {
  const [db, redis] = await Promise.allSettled([
    dbHealthCheck(),
    redisHealthCheck(),
  ]);

  const status = {
    app:   "ok",
    db:    db.status     === "fulfilled" && db.value     ? "ok" : "error",
    redis: redis.status  === "fulfilled" && redis.value  ? "ok" : "error",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "2.0.0",
  };

  const healthy = status.db === "ok"; // Redis é não-crítico
  return NextResponse.json(status, { status: healthy ? 200 : 503 });
}
