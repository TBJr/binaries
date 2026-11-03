import { APP_COMPANY, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { RouteArt } from "@/components/landing/RouteArt";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="brand-hero">{APP_NAME}</p>
            <h1 id="hero-heading">{APP_TAGLINE}</h1>
            <p className="lead">
              {APP_NAME} helps teams compose mail, manage contacts and campaigns, and run delivery
              operations with consent and accountability — by {APP_COMPANY}.
            </p>
            <div className="hero-actions">
              <Button asChild size="lg" className="btn btn-primary rounded-[0.6rem] px-5 py-3 text-base">
                <a href="#contact">Talk to us</a>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="btn btn-secondary rounded-[0.6rem] px-5 py-3 text-base"
              >
                <a href="#services">See what we do</a>
              </Button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <RouteArt />
          </div>
        </div>
      </div>
    </section>
  );
}
