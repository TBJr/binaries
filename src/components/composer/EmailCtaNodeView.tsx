import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";

import { cn } from "@/lib/utils";

export function EmailCtaNodeView({ node, selected }: NodeViewProps) {
  const label = typeof node.attrs.label === "string" ? node.attrs.label : "Button";
  const variant = node.attrs.variant === "secondary" ? "secondary" : "primary";
  const isPrimary = variant === "primary";

  return (
    <NodeViewWrapper className="my-3">
      <div
        className={cn(
          "inline-flex rounded-md px-6 py-3 text-sm font-semibold",
          isPrimary
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-muted text-primary",
          selected && "ring-2 ring-ring ring-offset-2",
        )}
        contentEditable={false}
      >
        {label}
      </div>
    </NodeViewWrapper>
  );
}
