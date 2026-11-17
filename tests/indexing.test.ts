import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexingAllowed, NOINDEX_HEADER } from "@/lib/indexing";

describe("indexingAllowed", () => {
  it.each([undefined, "", "true", "1", "YES", " yes", "yes "])(
    "stays off for %j",
    (value) => {
      expect(indexingAllowed({ ALLOW_INDEXING: value })).toBe(false);
    },
  );

  it('turns on only for exactly "yes"', () => {
    expect(indexingAllowed({ ALLOW_INDEXING: "yes" })).toBe(true);
  });
});

// The three places that tell crawlers to stay away. Each reads the env when
// its module loads, so every test loads them fresh.
async function load() {
  const { default: config } = await import("../next.config");
  const { default: robots } = await import("@/app/robots");
  const { robotsMeta } = await import("@/lib/indexing");
  const { proxy } = await import("@/proxy");
  const redirect = proxy(new NextRequest("http://localhost:3400/", { headers: { "accept-language": "et-EE,et;q=0.9" } }));
  return { headers: await config.headers!(), robots: robots(), metadata: { robots: robotsMeta() }, redirect };
}

it("the root layout takes its robots meta from the switch", () => {
  const src = readFileSync(new URL("../src/app/[locale]/layout.tsx", import.meta.url), "utf8");
  expect(src).toContain("robots: robotsMeta()");
});

describe("signals", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ALLOW_INDEXING;
    vi.resetModules();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_INDEXING;
    else process.env.ALLOW_INDEXING = saved;
  });

  it("staging (unset): header, robots.txt and meta all say noindex", async () => {
    delete process.env.ALLOW_INDEXING;
    const { headers, robots, metadata, redirect } = await load();

    expect(headers).toEqual([
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_HEADER }],
      },
    ]);
    expect(robots).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("http://localhost:3400/et");
    expect(redirect.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
  });

  it('rempire.ee (ALLOW_INDEXING="yes"): all three open up', async () => {
    process.env.ALLOW_INDEXING = "yes";
    const { headers, robots, metadata, redirect } = await load();

    expect(headers).toEqual([]);
    expect(robots).toEqual({ rules: { userAgent: "*", allow: "/" } });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(redirect.headers.get("x-robots-tag")).toBeNull();
  });
});
