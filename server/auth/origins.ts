/** Browser origins allowed to call Better Auth. Adds apex/www pairs for public hostnames. */
export function authTrustedOrigins(frontendUrl: string) {
  const origins = new Set<string>([frontendUrl]);
  try {
    const url = new URL(frontendUrl);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return [...origins];
    }
    if (host.startsWith("www.")) {
      origins.add(`${url.protocol}//${host.slice(4)}`);
    } else {
      origins.add(`${url.protocol}//www.${host}`);
    }
  } catch {
    return [frontendUrl];
  }
  return [...origins];
}
