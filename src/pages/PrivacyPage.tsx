import { Link } from "react-router-dom";

import { Atmosphere } from "@/components/layout/Atmosphere";
import { PageMeta } from "@/components/layout/PageMeta";
import { APP_COMPANY, APP_NAME, contactEmail } from "@/lib/brand";
import { publicPageMeta } from "@/lib/page-meta";

function contactLine() {
  if (contactEmail) {
    return (
      <>
        Contact <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </>
    );
  }
  return <>Contact the operator using the address published for this deployment.</>;
}

export function PrivacyPage() {
  const meta = publicPageMeta["/privacy/"];

  return (
    <div className="page legal-page">
      <PageMeta title={meta.title} description={meta.description} canonicalPath={meta.canonicalPath} />
      <Atmosphere />
      <main>
        <div className="shell">
          <Link className="legal-back" to="/">
            ← Back to home
          </Link>
          <h1>Privacy Policy</h1>
          <p className="legal-updated">
            Operator: {APP_COMPANY} ({APP_NAME}).
          </p>
          <div className="legal-prose">
            <h2>Who we are</h2>
            <p>
              {APP_COMPANY} operates {APP_NAME} and related services. {contactLine()}
            </p>
            <h2>Information we collect</h2>
            <p>Depending on how you use our services, we may process:</p>
            <ul>
              <li>Contact details you provide, such as name, email address, and organization</li>
              <li>Message and campaign metadata needed to deliver and measure communications</li>
              <li>Technical logs such as IP address, browser type, and request timestamps</li>
              <li>Support correspondence and account activity for authenticated users</li>
            </ul>
            <h2>How we use information</h2>
            <p>
              We use personal information to operate our services, respond to inquiries, maintain
              security, meet legal obligations, and improve delivery reliability. We do not sell
              personal information.
            </p>
            <h2>Sharing</h2>
            <p>
              We may share information with processors that help us host, send, or secure services,
              and when required by law.
            </p>
            <h2>Retention</h2>
            <p>
              We retain information only as long as needed for the purposes above, including
              suppression and compliance records that must remain available to prevent unwanted
              future messages.
            </p>
            <h2>Your rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or restrict
              processing of your personal information. {contactLine()}
            </p>
            <h2>Contact</h2>
            <p>Questions about this policy: {contactLine()}</p>
            <p>
              This page is operator copy. Replace it with counsel-approved legal text before relying
              on it as a formal privacy policy.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
