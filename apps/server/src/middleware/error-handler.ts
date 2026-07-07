import type Koa from "koa";
import { isAppError } from "../errors.js";

export async function errorHandler(
  ctx: Koa.Context,
  next: Koa.Next,
): Promise<void> {
  try {
    await next();
  } catch (error) {
    const status = isAppError(error) ? error.status : 500;
    const code = isAppError(error) ? error.code : "INTERNAL_SERVER_ERROR";
    const message = isAppError(error)
      ? error.message
      : "Unexpected server error";
    ctx.status = status;
    ctx.body = {
      error: {
        code,
        message,
        details: isAppError(error) ? error.details : undefined,
      },
    };
    if (status >= 500) {
      ctx.app.emit("error", error, ctx);
    }
  }
}
