import { chromium } from "playwright-core";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const errors = [];
async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
  await page.waitForTimeout(1500);
  const H = await page.evaluate(() => document.querySelector(".cine").offsetHeight - innerHeight);
  for (const [i, p] of [0.1, 0.5, 0.9].entries()) {
    await page.evaluate((y) => scrollTo(0, y), H * p);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}-open-${i + 1}.png` });
  }
  for (const id of ["studio", "classes", "timetable", "packages", "first-visit", "find-us"]) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ behavior: "instant", block: "start" }), id);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 0) errors.push(`${name}: horizontal overflow ${overflow}px`);
  // booking flow
  await page.evaluate(() => document.getElementById("timetable").scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(800);
  const dayBtns = page.locator(".dia");
  for (let i = 0; i < 7; i++) {
    await dayBtns.nth(i).evaluate((el) => el.click());
    if (await page.locator(".aula button:not([disabled])").count()) break;
  }
  await page.locator(".aula button:not([disabled])").first().evaluate((el) => el.click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-booking-form.png` });
  await page.fill("#r-nome", "Test Client");
  await page.fill("#r-tel", "0712 345 678");
  await page.fill("#r-email", "test@example.com");
  await page.locator(".opcao").nth(0).click();
  await page.click("dialog .botao[type=submit]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-booking-done.png` });
  await page.click(".fechar-ok");
  // admin
  await page.goto("http://localhost:4173/admin.html");
  await page.fill("#codigo", "ritual");
  await page.click(".admin-trava-form .botao");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-admin-bookings.png`, fullPage: true });
  await page.click('[data-aba="timetable"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-admin-timetable.png` });
  await ctx.close();
}
await run("desktop", { width: 1440, height: 900 }, false);
await run("mobile", { width: 390, height: 844 }, true);
await browser.close();
console.log(errors.length ? errors.join("\n") : "no errors");
