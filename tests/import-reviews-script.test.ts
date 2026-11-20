/**
 * scripts/import-reviews.ts as the command line runs it: the file outside
 * the repository, a dry run that writes nothing, the mask on by default and
 * `--no-mask` updating the same rows. Fake reviews in a temp folder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { run } from "../scripts/import-reviews";
import { closeDb, query } from "@/lib/db";
import { freshDemo } from "./helpers";

afterAll(closeDb);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rempire-reviews-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const FAKE = [
  { date: "20.11.2026 14:32", rating: 5, text: "Отлично", name: "Кирилл", barber: "Valentin Nachinov" },
  { date: "2026-11-02", rating: 4, text: "", name: "Mari", barber: "Nobody Known" },
];
const fileOf = (name: string, body: unknown) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(body));
  return p;
};
const quiet = () => {};
const names = async () => (await query<{ author_name: string }>("select author_name from reviews order by created_at desc")).map((r) => r.author_name);

beforeEach(async () => {
  await freshDemo();
});

describe("scripts/import-reviews.ts", () => {
  it("a dry run reports and writes nothing", async () => {
    const lines: string[] = [];
    const r = await run([fileOf("a.json", FAKE), "--dry-run"], (l) => lines.push(l));
    expect(r).toMatchObject({ read: 2, inserted: 2 });
    expect(await names()).toEqual([]);
    expect(lines.join("\n")).toMatch(/^DRY RUN, nothing written\. Names masked/);
    // the barber it could not find is named; no client's name or phone is printed
    expect(lines.join("\n")).toContain("«Nobody Known»: 1");
    expect(lines.join("\n")).not.toContain("Кирилл");
  });

  it("masked by default, the same file twice changes nothing, --no-mask fills the whole names in", async () => {
    const file = fileOf("b.json", FAKE);
    expect(await run([file], quiet)).toMatchObject({ inserted: 2 });
    expect(await names()).toEqual(["К.", "M."]);
    expect(await run([file], quiet)).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(await run([file, "--no-mask"], quiet)).toMatchObject({ inserted: 0, updated: 2 });
    expect(await names()).toEqual(["Кирилл", "Mari"]);
  });

  it("refuses a file inside the repository, an unknown option, a missing file name and a file that is not a list", async () => {
    await expect(run([path.join(process.cwd(), "reviews.json")], quiet)).rejects.toThrow(/outside the repository/);
    await expect(run([fileOf("c.json", FAKE), "--force"], quiet)).rejects.toThrow(/Unknown option --force/);
    await expect(run([], quiet)).rejects.toThrow(/Usage/);
    await expect(run([fileOf("d.json", { reviews: FAKE })], quiet)).rejects.toThrow(/JSON array/);
    await expect(run([fileOf("e.json", FAKE), "--business=nope"], quiet)).rejects.toThrow(/No salon/);
    expect(await names()).toEqual([]);
  });
});
