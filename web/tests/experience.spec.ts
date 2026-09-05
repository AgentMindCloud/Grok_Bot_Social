import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const preview = "/experience/";

async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(preview);
  await expect(page.getByTestId("living-pool")).toBeVisible();
}

async function swimmerState(page: Page) {
  return page.locator(".lp-stage .lp-swimmer").evaluateAll((elements) => elements.map((node) => {
    const element = node as HTMLElement;
    const bob = element.querySelector(".lp-swimmer-bob")!;
    const arm = element.querySelector(".lp-stroke")!;
    return { left: element.style.left, top: element.style.top, transform: element.style.transform, bob: getComputedStyle(bob).transform, arm: getComputedStyle(arm).transform };
  }));
}

async function normalizedSwimmerPositions(page: Page) {
  return page.locator(".lp-stage .lp-swimmer").evaluateAll((elements) => {
    const stage = document.querySelector(".lp-stage")!.getBoundingClientRect();
    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: (rect.x + rect.width / 2 - stage.x) / stage.width, y: (rect.y + rect.height / 2 - stage.y) / stage.height };
    });
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`experience ${width}px: day and night remain usable without serious accessibility issues`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await start(page);
    const crewImage = page.locator(".xp-crew-art img");
    await crewImage.scrollIntoViewIfNeeded();
    await crewImage.evaluate((image: HTMLImageElement) => image.decode());
    expect(await crewImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await page.locator(".xp-header").scrollIntoViewIfNeeded();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("link", { name: "Join free", exact: true }).first()).toHaveAttribute("href", "https://bottocks.fun/join/");
    await expect(page.getByRole("link", { name: "Visit the real question pool", exact: true })).toHaveAttribute("href", "https://bottocks.fun/pool/");
    await expect(page.getByRole("link", { name: "Open avatar lab", exact: true })).toHaveAttribute("href", "https://bottocks.fun/avatar-lab/");
    await expect(page.getByRole("link", { name: "How to connect", exact: true })).toHaveAttribute("href", "https://bottocks.fun/help/");
    await expect(page.getByRole("link", { name: "Dive in", exact: true })).toHaveAttribute("href", "#play-pool");
    for (const world of ["day", "night"]) {
      if (world === "night") await page.getByRole("button", { name: "Switch to night", exact: true }).click();
      await expect(page.locator(".xp-experience")).toHaveAttribute("data-world", world);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${world}: document overflow`).toBe(true);
      const buttons = await page.locator(".lp-console button").evaluateAll((elements) => elements.map((node) => {
        const rect = node.getBoundingClientRect();
        return { text: node.textContent, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
      for (const button of buttons) {
        expect(button.left, `${world}: ${button.text} left edge`).toBeGreaterThanOrEqual(0);
        expect(button.right, `${world}: ${button.text} right edge`).toBeLessThanOrEqual(width + 1);
        expect(button.height, `${world}: ${button.text} target`).toBeGreaterThanOrEqual(24);
      }
      const poolActions = await page.locator(".lp-action").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, width: element.getBoundingClientRect().width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })));
      for (const button of poolActions) {
        expect(button.width, `${world}: ${button.text} usable width`).toBeGreaterThanOrEqual(100);
        expect(button.scrollWidth, `${world}: ${button.text} label clipping`).toBeLessThanOrEqual(button.clientWidth + 1);
      }
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(audit.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || "")), world).toEqual([]);
      await page.getByTestId("living-pool").screenshot({ path: `test-results/experience-pool-${world}-${width}.png` });
      await page.locator(".xp-header").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/experience-${world}-${width}.png`, fullPage: true });
    }
  });
}

test("swimmers travel and stroke, freeze when paused or offscreen, and resume", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  const pool = page.getByTestId("living-pool");
  await page.locator(".lp-stage").scrollIntoViewIfNeeded();
  await expect(pool).toHaveAttribute("data-motion", "on");
  const first = await swimmerState(page);
  await page.waitForTimeout(650);
  const second = await swimmerState(page);
  for (let index = 0; index < 3; index++) {
    expect([second[index].left, second[index].top, second[index].transform]).not.toEqual([first[index].left, first[index].top, first[index].transform]);
    expect(second[index].arm).not.toBe(first[index].arm);
  }
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(pool).toHaveAttribute("data-motion", "paused");
  const paused = await swimmerState(page);
  await page.waitForTimeout(500);
  expect(await swimmerState(page)).toEqual(paused);
  const beforeResize = await normalizedSwimmerPositions(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(150);
  const afterResize = await normalizedSwimmerPositions(page);
  for (let index = 0; index < 3; index++) {
    expect(Math.abs(afterResize[index].x - beforeResize[index].x)).toBeLessThan(0.015);
    expect(Math.abs(afterResize[index].y - beforeResize[index].y)).toBeLessThan(0.015);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Play motion", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: "Play motion", exact: true }).click();
  await page.locator(".lp-stage").scrollIntoViewIfNeeded();
  await expect(pool).toHaveAttribute("data-motion", "on");
  await page.locator(".xp-footer").scrollIntoViewIfNeeded();
  await expect(pool).toHaveAttribute("data-motion", "paused");
  const offscreen = await swimmerState(page);
  await page.waitForTimeout(500);
  expect(await swimmerState(page)).toEqual(offscreen);
  await page.locator(".lp-stage").scrollIntoViewIfNeeded();
  await expect(pool).toHaveAttribute("data-motion", "on");
  const resumed = await swimmerState(page);
  await page.waitForTimeout(400);
  expect(await swimmerState(page)).not.toEqual(resumed);
});

test("pool reacts to water taps and keyboard controls, bounds ducks and ripples, and resets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  const pool = page.getByTestId("living-pool");
  const stage = page.locator(".lp-stage");
  await stage.scrollIntoViewIfNeeded();
  const bounds = await stage.boundingBox();
  await stage.click({ position: { x: bounds!.width * 0.5, y: bounds!.height * 0.62 } });
  await expect(pool).toHaveAttribute("data-splashes", "1");
  const splash = page.getByRole("button", { name: /Make a splash/ });
  await splash.focus();
  await page.keyboard.press("Enter");
  await expect(pool).toHaveAttribute("data-splashes", "2");
  for (let index = 0; index < 5; index++) await splash.click();
  await expect(page.locator(".lp-tap-ripple")).toHaveCount(4);
  await page.getByRole("button", { name: /Add a duck/ }).click();
  await page.getByRole("button", { name: /Add a duck/ }).click();
  await expect(page.getByRole("button", { name: /Duck squad complete/ })).toBeDisabled();
  await expect(page.locator(".lp-duck")).toHaveCount(3);
  await page.getByRole("button", { name: "Race", exact: true }).click();
  await expect(pool).toHaveAttribute("data-mode", "race");
  await expect(pool).toHaveAttribute("data-motion", "paused");
  const glitch = page.getByRole("button", { name: "Glitch", exact: true });
  await glitch.focus();
  await page.keyboard.press("Space");
  await expect(glitch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".lp-character-quote")).toContainText("The shades stay on");
  await page.getByRole("button", { name: "Reset illustrated pool", exact: true }).click();
  await expect(pool).toHaveAttribute("data-mode", "chill");
  await expect(pool).toHaveAttribute("data-selected", "byte");
  await expect(pool).toHaveAttribute("data-splashes", "0");
  await expect(page.locator(".lp-duck")).toHaveCount(1);
  await expect(page.locator(".lp-tap-ripple")).toHaveCount(0);
});

test("reduced motion freezes actual animation and keeps instant examples usable without network writes", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${request.url()}`); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(preview);
  const pool = page.getByTestId("living-pool");
  await page.locator(".lp-stage").scrollIntoViewIfNeeded();
  await expect(pool).toHaveAttribute("data-motion", "paused");
  const first = await swimmerState(page);
  await page.waitForTimeout(500);
  expect(await swimmerState(page)).toEqual(first);
  await expect(page.getByRole("button", { name: "Reduced motion enabled by your device" })).toBeDisabled();
  await page.getByRole("button", { name: "A useful second opinion", exact: true }).click();
  await page.getByRole("button", { name: "Send the sample question", exact: true }).click();
  await expect(page.locator(".xp-journey-status")).toHaveText("Three example replies are ready.");
  await expect(page.locator(".xp-example-replies article")).toHaveCount(3);
  await expect(page.locator(".xp-example-replies")).toContainText("fewer moving parts");
  await expect(page.locator(".xp-fineprint")).toContainText("No question is posted");
  expect(apiRequests).toEqual([]);
});

test("question example completes its visible journey and reset cancels pending replies", async ({ page }) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${request.url()}`); });
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  const send = page.getByRole("button", { name: "Send the sample question", exact: true });
  await send.click();
  await expect(page.locator(".xp-journey-status")).toHaveText("Your question is on its way…");
  await expect(send).toBeDisabled();
  await expect(page.locator(".xp-journey-status")).toHaveText("A few different minds are on it…");
  await expect(page.locator(".xp-example-replies article")).toHaveCount(3);
  await expect(page.locator(".xp-example-replies")).toContainText("QuackGPT");
  await page.getByRole("button", { name: "Reset example", exact: true }).click();
  await send.click();
  await page.getByRole("button", { name: "Reset example", exact: true }).click();
  await page.waitForTimeout(2100);
  await expect(page.locator(".xp-journey-status")).toHaveText("Ready when you are.");
  await expect(page.locator(".xp-example-replies article")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
