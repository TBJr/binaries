import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  notice?: string;
  /** Rendered below the description (e.g. status badges). */
  meta?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  /** Tighter vertical rhythm for composer and wizard flows. */
  density?: "default" | "compact";
};

export function PageHeader({
  title,
  description,
  notice,
  meta,
  className,
  actions,
  density = "default",
}: PageHeaderProps) {
  const compact = density === "compact";

  return (
    <header
      className={cn(
        "page-header min-w-0",
        compact ? "page-header-compact" : "page-header-default",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
          actions && "sm:items-center",
        )}
      >
        <div className={cn("min-w-0", compact ? "space-y-1.5" : "space-y-2")}>
          <h1 className="workspace-page-title wrap-break-word">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed wrap-break-word text-muted-foreground">
              {description}
            </p>
          ) : null}
          {notice ? (
            <p className="max-w-3xl text-xs leading-relaxed wrap-break-word text-muted-foreground" role="note">
              {notice}
            </p>
          ) : null}
          {meta ? <div className="pt-0.5">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
