import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { TestSendFollowUp } from "@/lib/test-send-follow-up";
import { cn } from "@/lib/utils";

type Notice = {
  id: string;
  tone: TestSendFollowUp["tone"];
  message: string;
  action: TestSendFollowUp["action"];
};

type AppNoticeContextValue = {
  notify: (followUp: Pick<TestSendFollowUp, "tone" | "message" | "action">) => void;
};

const AppNoticeContext = createContext<AppNoticeContextValue | null>(null);

export function useAppNotice() {
  const context = useContext(AppNoticeContext);
  if (!context) {
    throw new Error("Notifications are unavailable outside the application shell.");
  }
  return context;
}

export function AppNoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setContainer(document.body);
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback(
    (followUp: Pick<TestSendFollowUp, "tone" | "message" | "action">) => {
      const message = followUp.message.trim();
      if (!message) return;
      const id = crypto.randomUUID();
      setNotices((current) => [...current.slice(-2), { id, tone: followUp.tone, message, action: followUp.action }]);
      if (followUp.tone === "success") {
        const timer = window.setTimeout(() => dismiss(id), 8000);
        timers.current.push(timer);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <AppNoticeContext.Provider value={value}>
      {children}
      {container
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col gap-2 sm:left-auto sm:w-[24rem]"
              aria-label="Notifications"
            >
              {notices.map((notice) => {
                const Icon = notice.tone === "success" ? CircleCheck : notice.tone === "warning" ? TriangleAlert : CircleX;
                return (
                  <div
                    key={notice.id}
                    role={notice.tone === "success" ? "status" : "alert"}
                    className={cn(
                      "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg",
                      notice.tone === "success" && "border-primary/40",
                      notice.tone === "warning" && "border-amber-600/40",
                      notice.tone === "error" && "border-destructive/40",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        notice.tone === "success" && "text-primary",
                        notice.tone === "warning" && "text-amber-700",
                        notice.tone === "error" && "text-destructive",
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p>{notice.message}</p>
                      {notice.action ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={notice.action.to} state={{ refreshSent: notice.id }}>
                            {notice.action.label}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm"
                      aria-label="Dismiss notification"
                      onClick={() => dismiss(notice.id)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>,
            container,
          )
        : null}
    </AppNoticeContext.Provider>
  );
}
