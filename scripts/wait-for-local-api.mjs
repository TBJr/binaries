/**
 * Development-only: wait until the local API answers /api/ping.
 * This avoids the Vite proxy ECONNREFUSED against /api/auth/get-session
 * while tsx is still starting the server.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const fileEnv = existsSync(".env") ? parse(readFileSync(".env")) : {};
const port = Number(process.env.PORT || fileEnv.PORT || 3001);
const url = `http://127.0.0.1:${port}/api/ping`;
const deadline = Date.now() + 30_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.info(`[dev] API ready on 127.0.0.1:${port}`);
      process.exit(0);
    }
  } catch {
    // The API process has not opened the port yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

console.error(`[dev] API did not answer ${url} within 30s`);
process.exit(1);
