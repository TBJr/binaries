import dns from "node:dns";
import net from "node:net";

/**
 * Node 20 enables Happy Eyeballs (`autoSelectFamily`) and aborts each address
 * after 250ms. Neon publishes IPv6 addresses that are unreachable on some
 * local networks, and the IPv4 handshake is often slower than 250ms, so Node
 * reports AggregateError [ETIMEDOUT] even though PostgreSQL is up.
 *
 * Development prefers IPv4 and waits at least as long as the driver connect
 * timeout before giving up on an address. Production keeps Node's defaults.
 */
const DEVELOPMENT_ATTEMPT_FLOOR_MS = 10_000;

let configured = false;

export function configureOutboundConnections(options?: {
  nodeEnv?: string;
  connectTimeoutMs?: number;
}) {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === "production" || nodeEnv === "test") return;

  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }

  const floor = Math.max(DEVELOPMENT_ATTEMPT_FLOOR_MS, options?.connectTimeoutMs ?? 0);
  if (
    typeof net.getDefaultAutoSelectFamilyAttemptTimeout !== "function" ||
    typeof net.setDefaultAutoSelectFamilyAttemptTimeout !== "function"
  ) {
    return;
  }

  const current = net.getDefaultAutoSelectFamilyAttemptTimeout();
  if (current >= floor) return;
  net.setDefaultAutoSelectFamilyAttemptTimeout(floor);
  if (!configured) {
    configured = true;
    console.info(
      `[database] development network ipv4first autoSelectFamilyAttemptTimeoutMs=${floor}`,
    );
  }
}
