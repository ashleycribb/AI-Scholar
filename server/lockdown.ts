/**
 * Wires the lockdown pieces onto an Express app in the one order that is safe:
 * CORS allowlist, then the route policy, both before any body parser or route handler.
 * server.ts and the integration tests call this same function.
 */
import type { Express } from "express";
import type { Auth } from "./auth";
import { createCors, loadCorsConfig, type CorsConfig } from "./cors";
import { enforceRoutePolicy } from "./routePolicy";
import { loadServiceAuth, type ServiceAuth } from "./serviceAuth";

export interface Lockdown { service: ServiceAuth; cors: CorsConfig }

export function applyLockdown(
  app: Express,
  auth: Pick<Auth, "config" | "requireAuth" | "requireRole" | "sessionFor">,
  env: NodeJS.ProcessEnv = process.env,
  warn: (line: string) => void = l => console.warn(l),
): Lockdown {
  const service = loadServiceAuth(env);
  const cors = loadCorsConfig(env, [auth.config.publicUrl, ...auth.config.allowedOrigins]);
  for (const problem of [...service.problems, ...cors.problems]) warn(`[config] ${problem}`);
  app.use(createCors(cors));
  app.use(enforceRoutePolicy({ auth, service }));
  return { service, cors };
}
