import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { CompactEditorToolbar } from "@/components/composer/CompactEditorToolbar";
import { EditorToolbar } from "@/components/composer/EditorToolbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EMPTY_TIPTAP_DOC, type TiptapDoc } from "@/lib/email-content";
import { normalizeEmailLinkUrl } from "@/lib/safe-email-url";
import { EMAIL_CTA_NODE, type EmailCtaVariant } from "@/lib/tiptap-email-cta";
import { composerExtensions, settingsMessageExtensions } from "@/lib/tiptap-extensions";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  content: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  className?: string;
  variant?: "full" | "compact";
};

export function RichTextEditor({
  content,
  onChange,
  className,
  variant = "full",
}: RichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("Complete Registration");
  const [ctaUrl, setCtaUrl] = useState("https://");
  const [ctaVariant, setCtaVariant] = useState<EmailCtaVariant>("primary");
  const [ctaError, setCtaError] = useState<string | null>(null);

  const extensions = variant === "compact" ? settingsMessageExtensions : composerExtensions;
  const minHeight = variant === "compact" ? "min-h-[160px]" : "min-h-[280px]";

  const editor = useEditor({
    extensions,
    content: content ?? EMPTY_TIPTAP_DOC,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-editor px-4 py-3 focus:outline-none [&_a]:text-primary [&_a]:underline",
          minHeight,
        ),
        "aria-label": variant === "compact" ? "Test message body" : "Email body",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON() as TiptapDoc);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    const nextJson = JSON.stringify(content ?? EMPTY_TIPTAP_DOC);
    if (currentJson !== nextJson) {
      editor.commands.setContent(content ?? EMPTY_TIPTAP_DOC, { emitUpdate: false });
    }
  }, [content, editor]);

  const openLinkDialog = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(previous ?? "https://");
    setLinkError(null);
    setLinkOpen(true);
  };

  const removeLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
    setLinkError(null);
  };

  const applyLink = () => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      removeLink();
      return;
    }
    const normalized = normalizeEmailLinkUrl(trimmed);
    if (!normalized) {
      setLinkError("Use an http, https, or mailto link.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    setLinkOpen(false);
    setLinkError(null);
  };

  const openCtaDialog = () => {
    if (!editor) return;
    if (editor.isActive(EMAIL_CTA_NODE)) {
      const attrs = editor.getAttributes(EMAIL_CTA_NODE);
      setCtaLabel(typeof attrs.label === "string" ? attrs.label : "Complete Registration");
      setCtaUrl(typeof attrs.href === "string" && attrs.href ? attrs.href : "https://");
      setCtaVariant(attrs.variant === "secondary" ? "secondary" : "primary");
    } else {
      setCtaLabel("Complete Registration");
      setCtaUrl("https://");
      setCtaVariant("primary");
    }
    setCtaError(null);
    setCtaOpen(true);
  };

  const removeCta = () => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
    setCtaOpen(false);
    setCtaError(null);
  };

  const applyCta = () => {
    if (!editor) return;
    const label = ctaLabel.trim();
    const href = normalizeEmailLinkUrl(ctaUrl);
    if (!label) {
      setCtaError("Enter button text.");
      return;
    }
    if (!href) {
      setCtaError("Use an http, https, or mailto destination.");
      return;
    }
    const attrs = { label, href, variant: ctaVariant };
    if (editor.isActive(EMAIL_CTA_NODE)) {
      editor.chain().focus().updateAttributes(EMAIL_CTA_NODE, attrs).run();
    } else {
      editor.chain().focus().insertContent({ type: EMAIL_CTA_NODE, attrs }).run();
    }
    setCtaOpen(false);
    setCtaError(null);
  };

  const hasActiveLink = Boolean(editor?.isActive("link"));
  const hasActiveCta = Boolean(editor?.isActive(EMAIL_CTA_NODE));

  return (
    <div className={cn("rounded-lg border border-border bg-background shadow-xs", className)}>
      {variant === "compact" ? (
        <CompactEditorToolbar editor={editor} onLinkClick={openLinkDialog} onCtaClick={openCtaDialog} />
      ) : (
        <EditorToolbar editor={editor} onLinkClick={openLinkDialog} />
      )}
      <div className="sendstack-composer-editor rounded-b-lg border-t border-border">
        <EditorContent editor={editor} />
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasActiveLink ? "Edit link" : "Insert link"}</DialogTitle>
            <DialogDescription>
              Highlight text first, then set a destination. Only http, https, and mailto links are allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="composer-link-url">URL</Label>
            <Input
              id="composer-link-url"
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              placeholder="https://example.com"
              autoFocus
            />
            {linkError ? <p className="text-sm text-destructive">{linkError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {hasActiveLink ? (
              <Button type="button" variant="outline" onClick={removeLink}>
                Remove link
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyLink}>Apply link</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {variant === "compact" ? (
        <Dialog open={ctaOpen} onOpenChange={setCtaOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{hasActiveCta ? "Edit button" : "Insert button"}</DialogTitle>
              <DialogDescription>
                Add a call-to-action button with a validated destination URL.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cta-label">Button text</Label>
                <Input
                  id="cta-label"
                  value={ctaLabel}
                  onChange={(event) => {
                    setCtaLabel(event.target.value);
                    setCtaError(null);
                  }}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cta-url">Destination URL</Label>
                <Input
                  id="cta-url"
                  value={ctaUrl}
                  onChange={(event) => {
                    setCtaUrl(event.target.value);
                    setCtaError(null);
                  }}
                  placeholder="https://example.com/register"
                />
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={ctaVariant === "primary" ? "default" : "outline"}
                    onClick={() => setCtaVariant("primary")}
                  >
                    Primary
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={ctaVariant === "secondary" ? "default" : "outline"}
                    onClick={() => setCtaVariant("secondary")}
                  >
                    Secondary
                  </Button>
                </div>
              </div>
              {ctaError ? <p className="text-sm text-destructive">{ctaError}</p> : null}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {hasActiveCta ? (
                <Button type="button" variant="outline" onClick={removeCta}>
                  Remove button
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCtaOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyCta}>
                  {hasActiveCta ? "Save button" : "Insert button"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
