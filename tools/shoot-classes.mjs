import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const errs = [];
for (const [name, vp, m] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const p = await b.newPage({ viewport: vp, isMobile: m, hasTouch: m });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
  const H = await p.evaluate(() => document.querySelector(".cine").offsetHeight - innerHeight);
  await p.evaluate((y) => scrollTo(0, y), H * 0.1); await p.waitForTimeout(1500);
  await p.screenshot({ path: `/tmp/ritual/${name}-hero.png` });
  await p.evaluate(() => document.getElementById("classes").scrollIntoView({ behavior: "instant" })); await p.waitForTimeout(1300);
  await p.screenshot({ path: `/tmp/ritual/${name}-classes-closed.png` });
  await p.locator(".abre").evaluate((el) => el.click()); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector(".painel--classes").scrollIntoView({ behavior: "instant", block: "center" })); await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/ritual/${name}-classes-open.png` });
  const r = await p.evaluate(() => { const el = document.querySelector(".classes-lista li:last-child").getBoundingClientRect(); return { right: el.right, w: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth }; });
  console.log(name, JSON.stringify(r));
  await p.close();
}
await b.close();
console.log(errs.length ? errs.join("\n") : "no errors");
