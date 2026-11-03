export type RouteFailureKind = "not_found" | "forbidden" | "unavailable" | "stale_asset" | "unexpected";

export type RouteFailure = {
  kind: RouteFailureKind;
  title: string;
  description: string;
  reload: boolean;
};

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "statusText" in error && typeof error.statusText === "string") {
    return error.statusText;
  }
  return "";
}

function statusOf(error: unknown) {
  if (typeof error === "object" && error && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

export function isStaleAssetError(error: unknown) {
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk|ChunkLoadError|dynamically imported module/i.test(
    errorText(error),
  );
}

export function describeRouteFailure(error: unknown): RouteFailure {
  if (isStaleAssetError(error)) {
    return {
      kind: "stale_asset",
      title: "This page needs a reload",
      description:
        "Binaries.nl was updated and this page could not load the latest application files.",
      reload: true,
    };
  }
  const status = statusOf(error);
  if (status === 404) {
    return {
      kind: "not_found",
      title: "Page not found",
      description: "The page you're looking for does not exist or may have moved.",
      reload: false,
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      title: "Access denied",
      description: "You do not have permission to view this area.",
      reload: false,
    };
  }
  if (status === 503) {
    return {
      kind: "unavailable",
      title: "Service temporarily unavailable",
      description: "Binaries.nl is temporarily unable to reach one of its required services.",
      reload: false,
    };
  }
  return {
    kind: "unexpected",
    title: "Something went wrong",
    description: "Binaries.nl could not load this page.",
    reload: false,
  };
}
