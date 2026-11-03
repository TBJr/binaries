import { Link } from "react-router-dom";

import { APP_NAME, contactEmail } from "@/lib/brand";

export function Contact() {
  return (
    <section className="contact-section" id="contact" aria-labelledby="contact-heading">
      <div className="shell">
        <div className="contact-panel">
          <div>
            <p className="kicker kicker-light">Contact</p>
            <h2 id="contact-heading">Start a conversation</h2>
            <p className="contact-lead">Reach a monitored inbox, or sign in to the workspace.</p>
          </div>
          <ul className="contact-list">
            <li>
              <span>Email</span>
              {contactEmail ? (
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              ) : (
                <span className="text-muted-foreground">Set VITE_CONTACT_EMAIL for production</span>
              )}
            </li>
            <li>
              <span>{APP_NAME}</span>
              <Link to="/login/">Sign in</Link>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
