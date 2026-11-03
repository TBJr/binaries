import { cn } from "@/lib/utils";

type AppPageContainerProps = React.ComponentProps<"div"> & {
  /** `wide` for inbox, mail, and admin tables. */
  width?: "default" | "wide";
};

const widthClasses = {
  default: "max-w-6xl",
  wide: "max-w-[90rem]",
} as const;

export function AppPageContainer({
  className,
  width = "default",
  ...props
}: AppPageContainerProps) {
  return (
    <div
      className={cn(
        "workspace-page-container mx-auto flex w-full min-w-0 flex-col gap-6",
        widthClasses[width],
        className,
      )}
      {...props}
    />
  );
}
