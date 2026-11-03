import type { Editor } from "@tiptap/react";
import { Bold, Italic, Link2, RectangleHorizontal, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EMAIL_CTA_NODE } from "@/lib/tiptap-email-cta";
import { cn } from "@/lib/utils";

type CompactEditorToolbarProps = {
  editor: Editor | null;
  onLinkClick: () => void;
  onCtaClick: () => void;
  className?: string;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-8 shrink-0", active && "bg-accent text-accent-foreground")}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function CompactEditorToolbar({
  editor,
  onLinkClick,
  onCtaClick,
  className,
}: CompactEditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const ctaActive = editor.isActive(EMAIL_CTA_NODE);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-border bg-muted/40 p-1.5",
        className,
      )}
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-7" />

      <ToolbarButton label="Insert link" active={editor.isActive("link")} onClick={onLinkClick}>
        <Link2 />
      </ToolbarButton>
      <ToolbarButton label="Insert button" active={ctaActive} onClick={onCtaClick}>
        <RectangleHorizontal />
      </ToolbarButton>
    </div>
  );
}
