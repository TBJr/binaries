/** Placeholder env for unit tests — never use in production. */
process.env.DATABASE_URL ??=
  "postgresql://kivorenta_test:test-password@127.0.0.1:5432/kivorenta_test?sslmode=disable";
process.env.BETTER_AUTH_SECRET ??= "kivorenta-test-better-auth-secret-min-32-chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";
process.env.FRONTEND_URL ??= "http://localhost:5173";
