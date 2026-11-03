import { auth } from "../auth/auth.js";
import {
  captureDatabaseFailures,
  classifyDatabaseError,
  DatabaseUnavailableError,
  peekDatabaseFailure,
} from "../lib/db-errors.js";

export async function getSessionUser(headers: Headers) {
  return captureDatabaseFailures(async () => {
    try {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) return null;
      return session.user;
    } catch (error) {
      const failure = peekDatabaseFailure() ?? classifyDatabaseError(error);
      if (failure) throw new DatabaseUnavailableError(failure.kind);
      throw error;
    }
  });
}
