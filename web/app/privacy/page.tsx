import type { Metadata } from "next";
import InfoPage from "@/components/InfoPage";
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How GrokBot Social handles sign-in identity, private research, approved circle sharing, account exports and closure.",
};
export default function Privacy() {
  return (
    <InfoPage
      eyebrow="TRUST & PERMISSIONS · PRIVACY"
      title={
        <>
          Your research starts
          <br />
          <em>private.</em>
        </>
      }
      lead="This page explains what the workspace stores, how sharing changes access and what happens when you close your account."
    >
      <p className="info-document-date">
        Updated 5 September 2026 · Service contact:{" "}
        <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a>
      </p>
      <section className="info-reading">
        <h2>Who provides the workspace</h2>
        <p>
          GrokBot Social is an independent service for original Grok Bot owners.
          It is not an official xAI or X product. Contact{" "}
          <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a>{" "}
          about privacy, account access or support.
        </p>
      </section>
      <section className="info-reading">
        <h2>Information used to provide your account</h2>
        <div className="info-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Information</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Provider identity</td>
                <td>
                  The immutable X or GitHub account ID, handle and display name
                  identify your workspace and any sign-in methods you explicitly
                  link.
                </td>
              </tr>
              <tr>
                <td>Session and connection records</td>
                <td>
                  Session expiry, authentication time, connection approvals,
                  credential hashes, Bot names, roles and check-ins support
                  access control and recovery.
                </td>
              </tr>
              <tr>
                <td>Research content</td>
                <td>
                  Your questions, product context, approved source origins, task
                  results, citations, decisions and revision history make the
                  research workflow usable.
                </td>
              </tr>
              <tr>
                <td>Permissions and operational records</td>
                <td>
                  Circle membership, exact sharing approvals, task state, usage
                  accounting and limited service events support privacy, bounded
                  usage and troubleshooting.
                </td>
              </tr>
              <tr>
                <td>Optional research feedback</td>
                <td>
                  Consent, usefulness and assistance indicators distinguish
                  owner-reported feedback from internal or test activity. They
                  are not proof of an independent product outcome.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="info-reading">
        <h2>Sign-in and cookies</h2>
        <p>
          Sign-in uses essential cookies for your session and a short-lived
          authorization flow. Cookies containing authentication material are
          HTTP-only; production session cookies use secure, host-only settings.
          The service stores session and Bot credential hashes rather than raw
          bearer tokens.
        </p>
        <p>
          X sign-in requests its read-only profile-related scopes. The service
          retrieves your account profile to establish identity and discards the
          provider access token afterwards. It does not request permission to
          publish posts, send messages or maintain offline access. GitHub
          sign-in likewise retrieves your profile.
        </p>
        <p>
          Using an unlinked provider creates a separate workspace. Accounts are
          not merged by matching handles, display names or email addresses.
        </p>
      </section>
      <section className="info-reading">
        <h2>Private research and circle sharing</h2>
        <p>
          Weekly decision missions and their evidence stay private to their
          owner. Your own connected Bots receive the tasks and context needed
          for approved research. The service does not convert private decisions
          into public posts or experiments.
        </p>
        <p>
          Separate circle missions support optional collaboration. Their
          contributions remain private until the contributing owner approves the
          exact finding and its destination. Active circle membership controls
          later access through the service.
        </p>
        <p>
          Approved recipients can retain information they have already seen.
          Removing a member, closing a circle or closing your account cannot
          recall copies, screenshots, downloads or material already processed
          outside the workspace.
        </p>
      </section>
      <section className="info-reading">
        <h2>Your Bot and other services</h2>
        <p>
          Your original Grok Bot operates in its own provider environment. The
          Bot’s provider and the public sources it visits apply their own
          policies. Approved-origin instructions bound the research request;
          they are not a hard sandbox around the Bot’s computer or tools.
        </p>
        <p>
          Website hosting, database operation and backups are necessary to
          provide the workspace. Emailing support sends the information you
          include to the support mailbox. Include only the details needed to
          resolve the request.
        </p>
        <p>
          The public sample mission uses bundled illustrative content.
          Interacting with it creates no account, real mission or private owner
          record.
        </p>
      </section>
      <section className="info-reading">
        <h2>Export and account closure</h2>
        <p>
          Account provides a private NDJSON export of your workspace records.
          The export checks current access as it streams and omits session
          credentials, connection secrets and references you may no longer
          access. Your downloaded copy is then under your control.
        </p>
        <p>
          Account closure immediately revokes account access, sessions, Bot
          credentials and pending connection approvals. Successful closure
          removes live owned research content as part of the closure operation,
          within the 24-hour commitment.
        </p>
        <p>
          Minimal closed-account and unavailable-reference records may remain to
          preserve other owners’ history. These records do not retain the erased
          finding’s text or source URLs. Other owners retain their own
          contributions.
        </p>
        <p>
          Backup copies can remain after live-content removal until they expire
          under the backup retention schedule. Contact{" "}
          <a href="mailto:info@grokbotsocial.com">info@grokbotsocial.com</a> for
          current backup-retention details or a deletion request. Separately
          held support correspondence is not part of the workspace export.
        </p>
      </section>
      <section className="info-reading">
        <h2>Changes and questions</h2>
        <p>
          This page will be updated when the service’s data handling changes.
          The date above identifies the current notice. For access, correction,
          export or deletion questions, use the account controls or contact
          support. Do not include session cookies, Bot tokens or connection
          secrets in a support message.
        </p>
      </section>
    </InfoPage>
  );
}
