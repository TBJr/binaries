import { AsyncLocalStorage } from "node:async_hooks";

import type { FullAuditRequestContext } from "./request-context.js";

const store = new AsyncLocalStorage<FullAuditRequestContext>();

export function runWithAuditRequestContext<T>(ctx: FullAuditRequestContext, work: () => T): T {
  return store.run(ctx, work);
}

export function getAuditRequestContext(): FullAuditRequestContext | null {
  return store.getStore() ?? null;
}
