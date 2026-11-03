import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { EmailCtaNodeView } from "@/components/composer/EmailCtaNodeView";

export const EMAIL_CTA_NODE = "emailCtaButton";

export type EmailCtaVariant = "primary" | "secondary";

export const EmailCtaButton = Node.create({
  name: EMAIL_CTA_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      href: { default: "" },
      label: { default: "Button" },
      variant: { default: "primary" },
    };
  },
  parseHTML() {
    return [{ tag: `div[data-type="${EMAIL_CTA_NODE}"]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": EMAIL_CTA_NODE,
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmailCtaNodeView);
  },
});
