import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

import { fetchWithStartupRetry } from "@/lib/dev-session-fetch";

const baseURL =
  typeof import.meta.env.VITE_APP_URL === "string" && import.meta.env.VITE_APP_URL.length > 0
    ? import.meta.env.VITE_APP_URL
    : undefined;

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    customFetchImpl: (input, init) =>
      fetchWithStartupRetry(input, init, { dev: import.meta.env.DEV }),
  },
  plugins: [
    adminClient(),
    twoFactorClient({
      twoFactorPage: "/login/two-factor/",
    }),
  ],
});

export type AuthSession = typeof authClient.$Infer.Session;
