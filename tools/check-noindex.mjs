#!/usr/bin/env node
// Checks that a running copy of the app tells crawlers to stay away:
// the X-Robots-Tag header, the <meta name="robots"> tag and robots.txt.
// Run it after every staging deploy, on every address the app answers on
// (with SITE_URL and STAFF_URL split: the client address, the staff address
// and today's staging address). Exit code 1 if anything is missing.
//
//   node tools/check-noindex.mjs                       # http://localhost:3400
//   node tools/check-noindex.mjs https://rempire-booking.diipsolutions.eu

const base = (process.argv[2] || "http://localhost:3400").replace(/\/+$/, "");
const fails = [];

async function fetchOne(url) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "rempire-booking-noindex-check" },
  });
  return { res, body: await res.text() };
}

const get = (path) => fetchOne(base + path);

function header(res) {
  return res.headers.get("x-robots-tag") || "";
}

// A page with its redirects followed by hand, every hop checked for the
// header. "/" goes to a language on the client address and to the staff
// app's start on the staff address; the staff address sends client pages
// to the client address (src/lib/hosts.ts). A redirect to another host
// ends the walk: that host is checked on its own run (after the move the
// client address is indexed, the staff address never). The last hop on
// this host must be a page with the meta tag.
async function page(path) {
  const host = new URL(base).host;
  let url = new URL(base + path);
  for (let hop = 0; hop < 6; hop++) {
    const { res, body } = await fetchOne(url);
    if (!/noindex/i.test(header(res))) fails.push(`${url.href} (${res.status}) X-Robots-Tag is "${header(res)}"`);
    const to = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !to) {
      if (!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(body)) {
        fails.push(`${path} (ends at ${url.href}, ${res.status}) has no <meta name="robots" content="noindex…">`);
      }
      return;
    }
    url = new URL(to, url);
    if (url.host !== host) return;
  }
  fails.push(`${path}: more than 6 redirects`);
}

for (const path of ["/", "/ru", "/et", "/en"]) await page(path);

const robots = await get("/robots.txt");
if (!/^\s*Disallow:\s*\/\s*$/im.test(robots.body)) {
  fails.push("robots.txt does not say Disallow: /");
}
if (!/noindex/i.test(header(robots.res))) {
  fails.push(`robots.txt X-Robots-Tag is "${header(robots.res)}"`);
}

for (const path of [`/no-such-page-${Date.now()}`, `/ru/no-such-page-${Date.now()}`]) {
  const missing = await get(path);
  if (!/noindex/i.test(header(missing.res))) {
    fails.push(`${path} (${missing.res.status}) X-Robots-Tag is "${header(missing.res)}"`);
  }
}

if (fails.length) {
  console.error(`NOT noindex: ${base}`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`noindex OK: ${base} (header, meta, robots.txt, 404)`);
