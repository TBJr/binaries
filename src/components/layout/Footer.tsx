import { Link } from "react-router-dom";

import { APP_COMPANY, APP_NAME } from "@/lib/brand";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-row">
          <p>
            &copy; {year} {APP_NAME} · {APP_COMPANY}
          </p>
          <div className="footer-links">
            <Link to="/privacy/">Privacy</Link>
            <Link to="/terms/">Terms</Link>
            <Link to="/login/">Sign in</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
