"use client";
import { useEffect } from "react";
export default function AccountEntry() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth");
    const target = new URLSearchParams({ view: "account" });
    if (code && /^[a-z_-]{1,60}$/.test(code)) target.set("auth", code);
    window.location.replace(`/workspace/?${target}`);
  }, []);
  return (
    <main id="main" className="public-page living-account-entry">
      <h1>Your account</h1>
      <a className="glass-control" href="/workspace/?view=account">
        Open account settings
      </a>
    </main>
  );
}
