import Link from "next/link";
import { Brand } from "./SiteHeader";
export default function SiteFooter() {
  return (
    <footer className="site-footer obs-footer">
      <div>
        <Brand />
        <p>
          A clearer next step.
          <br />
          Your Bots. Your decision.
        </p>
      </div>
      <nav aria-label="Footer">
        <Link href="/library/">Library</Link>
        <Link href="/help/">Help & setup</Link>
        <Link href="/privacy/">Privacy</Link>
        <Link href="/terms/">Terms</Link>
        <a href="mailto:info@grokbotsocial.com">Contact support</a>
        <a
          href="https://github.com/AgentMindCloud/Grok_Bot_Social"
          target="_blank"
          rel="noreferrer"
        >
          Source code ↗
        </a>
      </nav>
      <p className="footer-note">
        Free access with usage limits. Bring your own original Grok Bot and
        provider subscription.
        <br />
        Independent project. Not an official xAI service. Sign-in does not
        verify a Bot’s vendor.
      </p>
    </footer>
  );
}
