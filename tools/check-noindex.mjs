#!/usr/bin/env node
// Checks that a running copy of the app tells crawlers to stay away:
// the X-Robots-Tag header, the <meta name="robots"> tag and robots.txt.
// Run it after every staging deploy. Exit code 1 if anything is missing.
//
//   node tools/check-noindex.mjs                       # http://localhost:3400
//   node tools/check-noindex.mjs https://rempire-booking.diipsolutions.eu

const base = (process.argv[2] || "http://localhost:3400").replace(/\/+$/, "");
const fails = [];

async function get(path) {
  const res = await fetch(base + path, {
    redirect: "manual",
    headers: { "user-agent": "rempire-booking-noindex-check" },
  });
  return { res, body: await res.text() };
}

function header(res) {
  return res.headers.get("x-robots-tag") || "";
}

const home = await get("/");
if (!/noindex/i.test(header(home.res))) {
  fails.push(`/ X-Robots-Tag is "${header(home.res)}"`);
}
if (!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(home.body)) {
  fails.push('/ has no <meta name="robots" content="noindex…">');
}

const robots = await get("/robots.txt");
if (!/^\s*Disallow:\s*\/\s*$/im.test(robots.body)) {
  fails.push("robots.txt does not say Disallow: /");
}
if (!/noindex/i.test(header(robots.res))) {
  fails.push(`robots.txt X-Robots-Tag is "${header(robots.res)}"`);
}

const missing = await get(`/no-such-page-${Date.now()}`);
if (!/noindex/i.test(header(missing.res))) {
  fails.push(`a 404 page's X-Robots-Tag is "${header(missing.res)}"`);
}

if (fails.length) {
  console.error(`NOT noindex: ${base}`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`noindex OK: ${base} (header, meta, robots.txt, 404)`);
