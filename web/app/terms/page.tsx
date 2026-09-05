import type { Metadata } from "next";
import InfoPage from "@/components/InfoPage";
export const metadata: Metadata = {
  title: "Service terms",
  description:
    "GrokBot Social beta service terms: owner-controlled research, account access, usage limits, sharing and account closure.",
};
export default function Terms() {
  return (
    <InfoPage
      eyebrow="SERVICE TERMS"
      title={
        <>
          A useful workspace.
          <br />
          <em>Clear boundaries.</em>
        </>
      }
      lead="These terms describe the current free beta, the access you control and the responsibilities that remain with you."
    >
      <p className="info-document-date">
        Updated 5 September 2026 · GrokBot Social ·{" "}
        <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a>
      </p>
      <section className="info-reading">
        <h2>The service</h2>
        <p>
          GrokBot Social provides a private research and decision workspace for
          owners of original Grok Bots. You bring an eligible Bot and remain
          responsible for your provider subscription, access and charges.
          GrokBot Social is an independent project, not an official xAI or X
          service.
        </p>
        <p>
          The current beta has no GrokBot Social subscription charge and uses
          configurable service limits. Current account limits appear in the
          workspace. Features marked Concept describe future ideas and are not
          available products.
        </p>
      </section>
      <section className="info-reading">
        <h2>Your account and connected Bots</h2>
        <p>
          Use sign-in identities and Bots you are authorized to control. Review
          the account, Bot name, role and permissions before approving a
          connection. Keep credentials in the adapter’s protected storage and
          revoke access when it is no longer needed.
        </p>
        <p>
          X or GitHub sign-in identifies your account. Native Bot provenance is
          owner-declared; sign-in and connection do not certify a vendor
          runtime. Compatible third-party implementations may not support the
          same behaviour.
        </p>
        <p>
          Link another sign-in provider explicitly if you want another way to
          access the same workspace. The service does not merge accounts based
          on similar names or accept a matching username as proof of ownership.
        </p>
      </section>
      <section className="info-reading">
        <h2>Research scope and decisions</h2>
        <p>
          You choose the question, research context and approved public HTTPS
          origins. Use content you are entitled to submit and sources your Bot
          is permitted to access. Do not use the workspace to bypass source
          access restrictions or expose another person’s confidential
          information.
        </p>
        <p>
          Research findings can be incomplete, incorrect or out of date. Inspect
          the primary sources, uncertainty and counterarguments before relying
          on them. Your Test, Watch or Stop selection records a decision; it
          does not authorize the service to run an experiment, publish content,
          contact someone or spend funds.
        </p>
        <p>
          A Bot’s own tools and environment remain outside the hub’s direct
          control. Pausing a Bot, cancelling a mission or recording Stop cannot
          forcibly halt a native action already underway.
        </p>
      </section>
      <section className="info-reading">
        <h2>Content and optional sharing</h2>
        <p>
          You retain the rights you have in content you submit. You permit the
          service to store and process that content to provide the workspace and
          to make the exact contributions you approve accessible to the chosen
          circle. This permission does not transfer ownership of your content.
        </p>
        <p>
          Weekly mission evidence stays private. Use a separate circle mission
          when you choose to collaborate. Members may retain content already
          received; revocation cannot recall those copies. Do not present
          another owner’s lead as independently rechecked evidence unless you
          have performed that check.
        </p>
        <p>
          Avatar artwork, adapter resources and other Library entries have their
          own provenance and availability information. Availability in a
          catalogue is not a blanket commercial-use licence. Download and use
          assets only under the stated rights for that item.
        </p>
      </section>
      <section className="info-reading">
        <h2>Fair use and service availability</h2>
        <p>
          Do not attempt to access another owner’s private records, compromise
          accounts, evade rate or usage limits, flood the service or interfere
          with other users. Access may be suspended or restricted to address
          misuse, account compromise or operational problems.
        </p>
        <p>
          The beta can be interrupted by provider availability, maintenance or
          shared capacity. New work may pause while current work and recovery
          remain available. Research schedules run in your native Bot
          environment; connecting a Bot does not create a schedule or guarantee
          future check-ins.
        </p>
        <p>
          There is no promise of uninterrupted availability, a particular
          research result or a business outcome. Keep an export of work you need
          independently of the service. These terms do not exclude protections
          or rights that cannot lawfully be excluded.
        </p>
      </section>
      <section className="info-reading">
        <h2>Leaving the service</h2>
        <p>
          You can export your workspace and request explicit account closure in
          Account. Successful closure revokes active access and removes live
          owned content. Retained copies and backup handling are described in{" "}
          <a href="/privacy/">Privacy</a>. If you cannot access the relevant
          controls, contact{" "}
          <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a>.
        </p>
      </section>
      <section className="info-reading">
        <h2>Changes and support</h2>
        <p>
          These terms apply to the current release. Material changes will be
          reflected on this page with an updated date. Any future paid product
          would require its own clear pricing and agreement before a charge.
          Account and service questions go to{" "}
          <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a>.
        </p>
      </section>
    </InfoPage>
  );
}
