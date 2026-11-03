import { Link } from "react-router-dom";

import { Atmosphere } from "@/components/layout/Atmosphere";
import { PageMeta } from "@/components/layout/PageMeta";
import { APP_COMPANY, APP_NAME, contactEmail } from "@/lib/brand";
import { publicPageMeta } from "@/lib/page-meta";

function contactLine() {
  if (contactEmail) {
    return <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  }
  return <span>the operator contact address published for this deployment</span>;
}

export function TermsPage() {
  const meta = publicPageMeta["/terms/"];

  return (
    <div className="page legal-page">
      <PageMeta title={meta.title} description={meta.description} canonicalPath={meta.canonicalPath} />
      <Atmosphere />
      <main>
        <div className="shell">
          <Link className="legal-back" to="/">
            ← Back to home
          </Link>
          <h1>Terms of Service</h1>
          <p className="legal-updated">
            Operator: {APP_COMPANY} ({APP_NAME}).
          </p>
          <div className="legal-prose">
            <h2>Agreement</h2>
            <p>
              By accessing this website or using services operated by {APP_COMPANY}, you agree to
              these terms. If you are using the services on behalf of an organization, you represent
              that you have authority to bind that organization.
            </p>
            <h2>Services</h2>
            <p>
              {APP_NAME} provides digital communications tools and related services. Features,
              availability, and supported volumes may change as the product evolves.
            </p>
            <h2>Acceptable use</h2>
            <p>You agree not to use the services to:</p>
            <ul>
              <li>Send unsolicited bulk messages without appropriate consent</li>
              <li>Violate applicable anti-spam, privacy, or consumer protection laws</li>
              <li>Attempt unauthorized access to systems, accounts, or data</li>
              <li>Interfere with delivery infrastructure or other customers</li>
            </ul>
            <h2>Accounts</h2>
            <p>
              You are responsible for safeguarding credentials and for activity under your account.
              Notify us promptly if you suspect unauthorized access.
            </p>
            <h2>Contact</h2>
            <p>
              Questions about these terms: {contactLine()}.
            </p>
            <p>
              This page is operator copy. Replace it with counsel-approved legal text before
              commercial launch.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
