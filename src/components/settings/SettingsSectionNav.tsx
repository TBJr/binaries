import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { normalizeAppPath } from "@/lib/dashboard-nav";

const SECTIONS = [
  { title: "Profile", url: "/app/settings/profile/" },
  { title: "Security", url: "/app/settings/security/" },
  { title: "Mailbox", url: "/app/settings/" },
] as const;

export function SettingsSectionNav() {
  const location = useLocation();
  const currentPath = normalizeAppPath(location.pathname);

  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
        const active = currentPath === section.url;
        return (
          <Link
            key={section.url}
            to={section.url}
            className={cn(
              "inline-flex min-h-9 items-center rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {section.title}
          </Link>
        );
      })}
    </nav>
  );
}
