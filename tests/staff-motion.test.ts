/**
 * The staff app (admin and barber app) has no «reduce motion» rules: it moves
 * as Altegio's admin does, whatever the browser's setting (Dim, 25.11.2026,
 * «Whole admin»; src/app/admin/admin.css). The client pages keep theirs.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function filesUnder(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(css|tsx?)$/.test(e.name))
    .map((e) => path.relative(ROOT, path.join(e.parentPath, e.name)));
}

describe("staff app motion", () => {
  it("no file of the admin or the barber app turns motion off for «reduce motion»", () => {
    const hits = [...filesUnder("src/app/admin"), ...filesUnder("src/app/b")].filter((f) =>
      /prefers-reduced-motion|reducedMotion/.test(readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")),
    );
    expect(hits).toEqual([]);
  });

  it("the client pages still do", () => {
    expect(readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8")).toContain("prefers-reduced-motion: reduce");
  });
});
