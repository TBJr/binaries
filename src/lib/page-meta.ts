import { APP_COMPANY, APP_NAME, APP_TAGLINE, canonicalHref } from "@/lib/brand";

export type PublicPageMeta = {
  title: string;
  description: string;
  canonicalPath: string;
};

export const publicPageMeta: Record<string, PublicPageMeta> = {
  "/": {
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description:
      "A modern email management platform for composition, contacts, campaigns, and accountable delivery operations.",
    canonicalPath: "/",
  },
  "/privacy/": {
    title: `Privacy Policy | ${APP_NAME}`,
    description: "How this service collects, uses, and protects information.",
    canonicalPath: "/privacy/",
  },
  "/terms/": {
    title: `Terms of Service | ${APP_NAME}`,
    description: "Terms governing use of this website and related services.",
    canonicalPath: "/terms/",
  },
  "/login/": {
    title: `Sign in | ${APP_NAME}`,
    description: `Sign in to the ${APP_NAME} workspace by ${APP_COMPANY}.`,
    canonicalPath: "/login/",
  },
  "/app/": {
    title: `Dashboard | ${APP_NAME}`,
    description: `${APP_NAME} dashboard overview.`,
    canonicalPath: "/app/",
  },
};

export function buildHeadTags(meta: PublicPageMeta) {
  const canonical = canonicalHref(meta.canonicalPath);
  return [
    `<title>${meta.title}</title>`,
    `<meta name="description" content="${meta.description}" />`,
    `<link rel="canonical" href="${canonical}" />`,
  ].join("");
}
