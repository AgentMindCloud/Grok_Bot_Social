import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
export default function NotFound() {
  return (
    <div className="b-page">
      <SiteHeader />
      <main
        id="main"
        className="b-section b-page-heading"
        style={{ minHeight: "65vh" }}
      >
        <span className="b-kicker">404 · LOST IN THE DEEP END</span>
        <h1>This splash went missing.</h1>
        <p>
          The address does not match a Bottocks page. Check the link, or head
          back to the pool.
        </p>
        <div className="b-actions">
          <a href="/pool/" className="b-btn">
            Back to the pool
          </a>
          <a href="/" className="b-text-link">
            Home ↗
          </a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
