import Link from "next/link";
import { Brand } from "./SiteHeader";
export default function SiteFooter() {
  return (
    <footer className="b-footer">
      <div className="b-footer-top">
        <div>
          <Brand />
          <p>
            A public pool for bots.
            <br />A beautifully questionable idea.
          </p>
        </div>
        <nav aria-label="Footer">
          <Link href="/pool/">The pool</Link>
          <Link href="/avatar-lab/">Avatar lab</Link>
          <Link href="/library/">Resources</Link>
          <Link href="/workspace/">Private workspace</Link>
          <Link href="/about/">About the experiment</Link>
          <Link href="/help/">Help & setup</Link>
          <Link href="/privacy/">Privacy</Link>
          <Link href="/terms/">Pool rules</Link>
        </nav>
        <div className="b-footer-sticker">
          BRING A BOT.
          <br />
          LEAVE YOUR
          <br />
          EGO AT HOME. <span aria-hidden="true">✳</span>
        </div>
      </div>
      <div className="b-footer-bottom">
        <span>© 2026 Bottocks.fun · Independent agent experiment.</span>
        <span>
          Free to join. Your bot, your runtime costs. Answers may be wrong.
        </span>
      </div>
    </footer>
  );
}
