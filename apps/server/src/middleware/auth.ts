import { timingSafeEqual } from "node:crypto";
import type Koa from "koa";
import type { ServerConfig } from "../config.js";
import { AppError } from "../errors.js";

function extractToken(ctx: Koa.Context): string | undefined {
  const authorization = ctx.get("authorization");
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return ctx.get("x-admin-token") || undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthMiddleware(config: ServerConfig): Koa.Middleware {
  return async (ctx, next) => {
    if (ctx.path === "/health" || ctx.path === "/api/health") {
      await next();
      return;
    }

    if (!config.adminToken) {
      throw new AppError(
        503,
        "AUTH_NOT_CONFIGURED",
        "ADMIN_TOKEN must be configured in .env.local before admin API routes are available",
      );
    }

    const token = extractToken(ctx);
    if (!token || !safeEqual(token, config.adminToken)) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "A valid admin bearer token is required",
      );
    }

    await next();
  };
}
