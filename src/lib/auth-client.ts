import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

import { fetchWithStartupRetry } from "@/lib/dev-session-fetch";

const baseURL = typeof window === "undefined" ? undefined : window.location.origin;

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
