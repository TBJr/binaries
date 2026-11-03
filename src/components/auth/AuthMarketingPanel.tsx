import { APP_COMPANY, APP_NAME, APP_TAGLINE } from "@/lib/brand";

export function AuthMarketingPanel() {
  return (
    <div className="relative hidden bg-muted md:block">
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-primary/90 via-primary/70 to-[#141821] p-8 text-primary-foreground">
        <p className="text-sm font-semibold tracking-wide uppercase opacity-80">{APP_NAME}</p>
        <p className="mt-2 text-2xl font-semibold leading-tight">{APP_TAGLINE}</p>
        <p className="mt-3 max-w-sm text-sm text-primary-foreground/85">
          Compose, queue, and send with accountability. By {APP_COMPANY} — outbound delivery is
          handled securely on the server.
        </p>
      </div>
    </div>
  );
}
