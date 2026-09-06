import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
const signedOut = {
  authenticated: false,
  localLoginEnabled: false,
  githubLoginEnabled: true,
};
const owner = { id: "owner-one", handle: "test-owner" };
const session = {
  ...signedOut,
  authenticated: true,
  owner,
  csrfToken: "test-csrf",
};
const bot = {
  id: "bot-one",
  ownerId: owner.id,
  name: "My actual bot",
  role: "scout",
  runtime: "external-agent",
  status: "active",
  lastSeenAt: null,
  createdAt: "2026-09-05T00:00:00Z",
  credentialScope: "pool-only",
  avatarConfig: null,
  avatarRevision: 0,
};
const defaults = {
  version: 1,
  color: "#74DFEE",
  expression: "wink",
  accessory: "antenna",
  badge: "Certified overthinker",
};
const poolStatus = {
  enabled: true,
  participatingBots: 0,
  openQuestions: 0,
  answeredQuestions: 0,
  replies: 0,
  limits: {},
};
const answer = (route: any, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
async function publicApi(page: any) {
  await page.route("**/api/session", (r: any) => answer(r, signedOut));
  await page.route("**/api/pool/status", (r: any) => answer(r, poolStatus));
  await page.route("**/api/pool/questions?*", (r: any) =>
    answer(r, { items: [], nextCursor: null }),
  );
}

test("all exported routes load, retain clear branding and contain a main landmark", async ({
  page,
}) => {
  test.setTimeout(90000);
  await publicApi(page);
  const routes = [
    "/",
    "/about/",
    "/account/",
    "/avatar-lab/",
    "/avatars/",
    "/bots/",
    "/bots/coalitionrunner/",
    "/bots/deepdive/",
    "/bots/helperbot/",
    "/bots/lunabot/",
    "/bots/nightguardian/",
    "/bots/pixelpal/",
    "/bots/sparkbot/",
    "/bots/storyweaver/",
    "/bots/vibeguardian/",
    "/claims/",
    "/communities/",
    "/connect/",
    "/feed/",
    "/gallery/",
    "/help/",
    "/humans/",
    "/join/",
    "/knowledge/",
    "/library/",
    "/marketplace/",
    "/missions/",
    "/pool/",
    "/privacy/",
    "/search/",
    "/skills/",
    "/terms/",
    "/workspace/",
  ];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main").first(), route).toBeVisible();
    await expect(page).toHaveTitle(/Bottocks/);
    await expect(page.locator("body")).not.toContainText(
      /GrokBot Social|Grok Bot Social|grokbotsocial\.com/,
    );
  }
  const missing = await page.goto("/definitely-not-a-bottocks-page/");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This splash went missing." }),
  ).toBeVisible();
});
for (const width of [320, 390, 768, 1440])
  test(`home ${width}px: usable controls, no horizontal scroll, no serious accessibility issues`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await publicApi(page);
    await page.goto("/");
    await page.locator(".xp-crew-art img").scrollIntoViewIfNeeded();
    await page
      .locator(".xp-crew-art img")
      .evaluate((img: HTMLImageElement) => img.decode());
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(page.locator(".xp-hero .xp-control--cyan")).toBeVisible();
    await expect(page.locator(".xp-hero .xp-control--pink")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
  });
test("sample changes only on explicit input, and shared pause persists after navigation", async ({
  page,
}) => {
  await publicApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "A useful second opinion" }).click();
  await page.getByRole("button", { name: "Send the sample question" }).click();
  await expect(page.locator(".xp-example-replies")).toContainText(
    "Write down how to run it and how to recover it.",
  );
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await page.goto("/avatar-lab/");
  await expect(
    page.getByRole("button", { name: "Motion paused", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Motion paused", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
});
test("local avatar save and hostile nickname SVG download never publish", async ({
  page,
}) => {
  await publicApi(page);
  let mutations = 0;
  await page.route("**/api/bots/*/avatar", (r) => {
    mutations++;
    return answer(r, {}, 500);
  });
  await page.goto("/avatar-lab/");
  const nickname = "<script>alert(1)</script>";
  await page.getByLabel("Ridiculous name").fill(nickname);
  await page
    .getByRole("button", { name: /Save (here|in this browser)/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved in this browser only" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Bot Card", exact: true })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let svg = "";
  for await (const chunk of stream!) svg += chunk.toString();
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain("<script>");
  expect(mutations).toBe(0);
});
test("assignment confirms identity/revision, preserves stale draft, reloads and unassigns", async ({
  page,
}) => {
  await page.route("**/api/session", (r) => answer(r, session));
  await page.route("**/api/workspace/summary", (r) =>
    answer(r, { bots: [bot] }),
  );
  let assignment: any = {
    botId: bot.id,
    config: null,
    revision: 0,
    updatedAt: null,
  };
  let conflict = true;
  let writes = 0;
  await page.route("**/api/bots/*/avatar", async (r) => {
    if (r.request().method() === "GET") return answer(r, assignment);
    expect(r.request().headers()["x-csrf-token"]).toBe("test-csrf");
    const body = r.request().postDataJSON();
    writes++;
    if (conflict) {
      conflict = false;
      assignment = {
        ...assignment,
        config: { ...defaults, color: "#B3A4FF" },
        revision: 1,
        updatedAt: "2026-09-05T01:00:00Z",
      };
      return answer(
        r,
        { message: "Avatar changed; read current assignment" },
        409,
      );
    }
    expect(body.expectedRevision).toBe(assignment.revision);
    const config = r.request().method() === "DELETE" ? null : body.config;
    assignment = {
      ...assignment,
      config,
      revision: assignment.revision + 1,
      updatedAt: "2026-09-05T02:00:00Z",
    };
    return answer(r, {
      ...assignment,
      replayed: false,
      receipt: {
        botId: bot.id,
        revision: assignment.revision,
        configurationHash: createHash("sha256")
          .update(JSON.stringify(config))
          .digest("hex"),
      },
    });
  });
  await page.goto("/avatar-lab/");
  await page
    .getByRole("button", { name: "Save to My actual bot", exact: true })
    .click();
  await expect(
    page.locator(".b-avatar-assignment").getByRole("alert"),
  ).toContainText("draft is preserved");
  await expect(
    page.getByRole("button", { name: "Pool blue", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Save to My actual bot", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Avatar assigned" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Remove assignment", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove assignment", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Assignment removed" }),
  ).toBeVisible();
  expect(writes).toBe(3);
});
test("moderation requires an explicit reviewed reason and a separate confirmation", async ({
  page,
}) => {
  await page.route("**/api/session", (r) => answer(r, session));
  await page.route("**/api/pool/participation", (r) =>
    answer(r, { bots: [], moderator: true }),
  );
  await page.route("**/api/pool/questions?*", (r) =>
    answer(r, { items: [], nextCursor: null }),
  );
  await page.route("**/api/pool/moderation/status", (r) =>
    answer(r, {
      openReports: 1,
      urgentReports: 1,
      oldestOpenReportAt: "2026-09-05T00:00:00Z",
      lastMaintenanceAt: null,
    }),
  );
  let report: any = {
    id: "report-one",
    questionId: "question-one",
    replyId: null,
    reason: "Privacy concern",
    createdAt: "2026-09-05T00:00:00Z",
    severity: "urgent",
    status: "open",
    resolutionReason: null,
    targetBotId: "other-bot",
    targetOwnerId: "other-owner",
  };
  let writes = 0;
  await page.route("**/api/pool/moderation/reports?*", (r) =>
    answer(r, {
      items: report.status === "open" ? [report] : [],
      nextCursor: null,
    }),
  );
  await page.route("**/api/pool/moderation/reports/report-one/resolve", (r) => {
    writes++;
    const body = r.request().postDataJSON();
    expect(body.expectedStatus).toBe("open");
    report = { ...report, status: body.status, resolutionReason: body.reason };
    return answer(r, { report, replayed: false, auditId: "audit-one" });
  });
  await page.goto("/pool/?view=settings");
  await page
    .getByRole("button", { name: "Resolve report", exact: true })
    .click();
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Confirm decision", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Decision reason")
    .fill("Reviewed and handled the privacy concern.");
  await page
    .getByRole("button", { name: "Confirm decision", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report resolved" }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("public pool has an honest empty state and safe signed-out ask flow", async ({
  page,
}) => {
  await publicApi(page);
  await page.goto("/pool/");
  await expect(
    page.getByRole("heading", { name: "A suspiciously quiet pool." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask the pool", exact: true }).click();
  await expect(page).toHaveURL(/view=ask/);
  await expect(
    page.getByRole("heading", { name: "Make a splash." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish question", exact: true }),
  ).toHaveCount(0);
});

test("core retained routes keep their forms legible and accessible at mobile width", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await publicApi(page);
  for (const route of [
    "/pool/",
    "/avatar-lab/",
    "/workspace/",
    "/connect/",
    "/help/",
    "/privacy/",
    "/bots/",
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route,
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
      route,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/route-${route.replaceAll("/", "")}-390.png`,
      fullPage: true,
    });
  }
});
test("missing mutation receipt recovers by GET without repeating the avatar publication", async ({
  page,
}) => {
  await page.route("**/api/session", (r) => answer(r, session));
  await page.route("**/api/workspace/summary", (r) =>
    answer(r, { bots: [bot] }),
  );
  let current: any = {
    botId: bot.id,
    config: null,
    revision: 0,
    updatedAt: null,
  };
  let writes = 0;
  await page.route("**/api/bots/*/avatar", (r) => {
    if (r.request().method() === "GET") return answer(r, current);
    writes++;
    current = {
      ...current,
      config: r.request().postDataJSON().config,
      revision: 1,
      updatedAt: "2026-09-05T02:00:00Z",
    };
    return answer(r, { ok: true });
  });
  await page.goto("/avatar-lab/");
  await page
    .getByRole("button", { name: "Save to My actual bot", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "confirmed by reading the bot again" }),
  ).toBeVisible();
  expect(writes).toBe(1);
});
test("browser storage denial leaves local editing and motion controls usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      value() {
        throw new DOMException("Denied", "SecurityError");
      },
    });
    Object.defineProperty(Storage.prototype, "getItem", {
      value() {
        throw new DOMException("Denied", "SecurityError");
      },
    });
  });
  await publicApi(page);
  await page.goto("/avatar-lab/");
  await page.getByRole("button", { name: "Hot pink", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hot pink", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Save in this browser", exact: true })
    .click();
  await expect(
    page
      .locator(".b-avatar-controls")
      .getByRole("alert")
      .filter({ hasText: "Browser storage is unavailable" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
});
test("mobile navigation works with keyboard and Escape restores summary focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await publicApi(page);
  await page.goto("/");
  const summary = page.locator(".b-mobile-menu summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".b-mobile-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(page.locator(".b-mobile-menu a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(summary).toBeFocused();
  await expect(page.locator(".b-mobile-menu")).not.toHaveAttribute("open", "");
});

test("home uses real counts, public question links and recoverable feed failure without mutations", async ({
  page,
}) => {
  await publicApi(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() !== "GET") writes++;
  });
  await page.route("**/api/pool/status", (r) =>
    answer(r, {
      ...poolStatus,
      participatingBots: 7,
      openQuestions: 2,
      replies: 1,
    }),
  );
  let unavailable = true;
  await page.route("**/api/pool/questions?*", (r) =>
    unavailable
      ? answer(r, { message: "Unavailable" }, 503)
      : answer(r, {
          items: [
            {
              id: "question-one",
              title: "<img src=x onerror=alert(1)> A real question",
              body: "public text",
              topic: "build",
              status: "waiting",
              replyCount: 1,
              author: {
                name: "Actual public bot",
                botId: "bot-one",
                avatarSlug: "byte",
              },
              createdAt: "2026-09-06T00:00:00Z",
              expiresAt: "2026-09-07T00:00:00Z",
            },
          ],
          nextCursor: null,
        }),
  );
  await page.goto("/");
  await expect(page.locator(".b-status-numbers strong")).toHaveText([
    "7",
    "2",
    "1",
  ]);
  await expect(page.locator(".b-pool-status")).toContainText(
    "Opted in doesn’t mean online",
  );
  await expect(
    page.getByRole("heading", { name: "The feed couldn’t load." }),
  ).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Try feed again" }).click();
  const questionLink = page.locator(".xp-feed-preview li a");
  await expect(questionLink).toHaveAttribute(
    "href",
    "/pool/?question=question-one",
  );
  await expect(questionLink).toContainText("<img src=x onerror=alert(1)>");
  await expect(questionLink.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Send the sample question" }).click();
  await expect(page.locator(".xp-example-replies")).toBeVisible();
  expect(writes).toBe(0);
});
