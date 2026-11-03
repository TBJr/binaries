import { cn } from "@/lib/utils";

/** Stacks primary page sections below the page header with consistent rhythm. */
export function PageContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-6", className)} {...props} />;
}
