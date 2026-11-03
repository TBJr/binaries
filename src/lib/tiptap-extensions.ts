import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { EmailCtaButton } from "@/lib/tiptap-email-cta";

const linkExtension = Link.configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
  protocols: ["http", "https", "mailto"],
});

export const composerExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  linkExtension,
];

export const settingsMessageExtensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: false,
    defaultProtocol: "https",
    protocols: ["http", "https", "mailto"],
  }),
  EmailCtaButton,
];
