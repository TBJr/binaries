export { EMPTY_TIPTAP_DOC, type TiptapDoc } from "@/lib/message-content";

export function isValidSenderEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function draftDisplaySubject(subject: string) {
  const trimmed = subject.trim();
  return trimmed || "Untitled draft";
}
