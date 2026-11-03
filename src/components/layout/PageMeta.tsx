import { Helmet } from "react-helmet-async";

import { canonicalHref } from "@/lib/brand";
import type { PublicPageMeta } from "@/lib/page-meta";

export function PageMeta({ title, description, canonicalPath }: PublicPageMeta) {
  const canonical = canonicalHref(canonicalPath);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </Helmet>
  );
}
