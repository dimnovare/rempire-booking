/**
 * «Выгрузить в Excel» (src/lib/admin/client-export.ts) and the .xlsx file
 * itself (src/lib/xlsx.ts): a file is written, opened again and read; the
 * export has the login's columns and the list's clients, only the owner
 * gets it, and the audit says how many rows without holding one. Fake
 * people only; the file never leaves memory.
 */
import { unzipSync, zipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setClientColumns } from "@/lib/admin/client-columns";
import { exportClients, type ExportWords } from "@/lib/admin/client-export";
import { saveClient, type ClientInput } from "@/lib/admin/clients";
import { adminCreateVisit, adminSetStatus } from "@/lib/admin/visits";
import { legacyHolder } from "@/lib/auth/rights-store";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { excelSerial, readXlsx, serialToLocal, writeXlsx } from "@/lib/xlsx";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
const NOW = at("2026-11-30", "12:00");
const WORDS: ExportWords = { sheet: "Клиенты", cols: { name: "Имя", phone: "Телефон", email: "Email", sold: "Продано, €", visits: "Визиты", discount: "Скидка, %", last: "Последний визит", first: "Первый визит" } };

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(closeDb);

async function add(input: ClientInput): Promise<string> {
  const r = await saveClient(demo.business, null, input, "test-admin");
  if (!r.ok) throw new Error(`client not added: ${r.field}`);
  return r.id;
}

/** A login with the rights its role had before there were rights (src/lib/auth/rights-store.ts). */
async function login(role: "owner" | "admin" | "staff", name: string) {
  const [u] = await query<{ id: string }>("insert into users (business_id, email, name, role) values ($1, $2, $3, $4) returning id", [demo.business.id, `${name}@example.test`, name, role]);
  return legacyHolder(role, u.id);
}

let n = 0;
async function visit(clientId: string, date: string, time: string) {
  const r = await adminCreateVisit(
    demo.business,
    { staffId: demo.staff.valentin, start: at(date, time), serviceIds: [demo.services.clip], clientId, idempotencyKey: `client-export-${++n}-${Math.random()}`, force: true },
    "test-admin",
  );
  if (!r.ok) throw new Error(`booking failed: ${r.code}`);
  await adminSetStatus(demo.business, r.id, "done", "test-admin");
  return r;
}

describe("an .xlsx file", () => {
  it("is written and read back: text, numbers, moments, empty cells, in their places", () => {
    const moment = at("2026-10-31", "12:30");
    const bytes = writeXlsx({
      name: "Клиенты",
      header: ["Имя", "Сумма", "Когда", "Пусто", "Знаки"],
      rows: [
        ["Анна «Näidis» & <сыновья>", 1240.5, { dateTime: excelSerial(moment, TZ) }, null, "a\tb\nc"],
        // what looks like a formula is a name and stays one
        ["=1+1", 0, null, undefined, "+372 5555 0101"],
        ["", -3, { dateTime: Number.NaN }, null, "'quoted' \"twice\""],
      ],
      widths: [30, 12],
    });
    // a zip, with the parts a sheet needs
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const sheet = readXlsx(bytes);
    expect(sheet.name).toBe("Клиенты");
    expect(sheet.rows[0]).toEqual(["Имя", "Сумма", "Когда", "Пусто", "Знаки"]);
    expect(sheet.rows[1][0]).toBe("Анна «Näidis» & <сыновья>");
    expect(sheet.rows[1][1]).toBe(1240.5);
    expect(serialToLocal(sheet.rows[1][2] as number)).toEqual({ date: "2026-10-31", time: "12:30" });
    expect(sheet.rows[1][3]).toBeNull();
    expect(sheet.rows[1][4]).toBe("a\tb\nc");
    expect(sheet.rows[2]).toEqual(["=1+1", 0, null, null, "+372 5555 0101"]);
    expect(sheet.rows[3]).toEqual([null, -3, null, null, "'quoted' \"twice\""]);
    expect(sheet.rows).toHaveLength(4);
  });

  it("a formula-looking text is a text cell, and a moment is the sheet's own day number in the salon's time", () => {
    const bytes = writeXlsx({ name: "a/b:c*d?e[f]g", header: ["x"], rows: [["=HYPERLINK(\"http://example.test\")"]] });
    const xml = new TextDecoder().decode(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('t="inlineStr"');
    expect(xml).not.toContain("<f>");
    // a tab's name cannot hold these signs
    expect(readXlsx(bytes).name).toBe("a b c d e f g");
    // 1.1.2026 00:00 in Tallinn is day 46023; summer time and winter time both read the wall clock
    expect(excelSerial(at("2026-01-01", "00:00"), TZ)).toBe(46023);
    expect(excelSerial(at("2026-07-01", "18:00"), TZ)).toBe(46204.75);
    expect(serialToLocal(46204.75)).toEqual({ date: "2026-07-01", time: "18:00" });
  });

  it("reads what other programs write: shared strings, text in several runs, a cell with no place given", () => {
    // written by hand here as another program would write it: no file from anywhere
    const bytes = writeXlsx({ name: "S", header: ["h"], rows: [] });
    const parts = unzipSync(bytes);
    const enc = (s: string) => new TextEncoder().encode(s);
    parts["xl/sharedStrings.xml"] = enc(`<sst xmlns="x"><si><t>Имя</t></si><si><r><t>Анна </t></r><r><rPr><b/></rPr><t xml:space="preserve">Näidis</t></r></si><si/></sst>`);
    parts["xl/worksheets/sheet1.xml"] = enc(
      `<worksheet xmlns="x"><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="str"><v>a &amp; b</v></c></row>` +
        `<row r="3"><c t="s"><v>1</v></c><c><v>42</v></c><c t="b"><v>1</v></c><c t="e"><v>#N/A</v></c><c r="F3"/></row>` +
        `</sheetData></worksheet>`,
    );
    const read = readXlsx(zipSync(parts));
    expect(read.rows).toEqual([["Имя", null, "a & b"], [], ["Анна Näidis", 42, true]]);
  });

  it("refuses what is no .xlsx", () => {
    expect(() => readXlsx(new TextEncoder().encode("not a zip at all"))).toThrow();
    expect(() => readXlsx(zipSync({ "hello.xml": new TextEncoder().encode("<a/>") }))).toThrow("not an .xlsx file");
  });
});

describe("the export", () => {
  it("the owner gets the list as a file: the head in his words, a row per client, the visits as dates", async () => {
    const owner = await login("owner", "renat");
    const anna = await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test", discountPct: 15 });
    await add({ name: "Boris Sample" });
    await visit(anna, "2026-11-03", "11:00"); // clip, 40 €
    await visit(anna, "2026-11-10", "16:30");
    const r = await exportClients(demo.business, owner, {}, WORDS, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toBe(2);
    expect(r.columns).toEqual(["name", "phone", "email", "sold", "visits", "discount", "last", "first"]);
    const sheet = readXlsx(r.bytes);
    expect(sheet.name).toBe("Клиенты");
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[0]).toEqual(["Имя", "Телефон", "Email", "Продано, €", "Визиты", "Скидка, %", "Последний визит", "Первый визит"]);
    const [name, phone, email, sold, visits, discount, last, first] = sheet.rows[1];
    expect([name, phone, email, sold, visits, discount]).toEqual(["Anna Näidis", "+37255550101", "anna@example.test", 80, 2, 15]);
    expect(serialToLocal(last as number)).toEqual({ date: "2026-11-10", time: "16:30" });
    expect(serialToLocal(first as number)).toEqual({ date: "2026-11-03", time: "11:00" });
    // a client with nothing: his name, zeros, and empty cells where there is no phone and no visit
    expect(sheet.rows[2]).toEqual(["Boris Sample", null, null, 0, 0, 0]);
  });

  it("has the columns this login keeps, the name first, and the clients the list's filter leaves, in its order", async () => {
    const owner = await login("owner", "renat");
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", gender: "female" });
    await add({ name: "Boris Sample", phone: "+372 5555 0102", gender: "male" });
    await add({ name: "Eve Sample", phone: "+372 5555 0105", gender: "female" });
    await setClientColumns(query, owner.id, ["visits", "phone"]);
    const r = await exportClients(demo.business, owner, { conds: [{ kind: "gender", value: "female" }], sort: "name", dir: "desc", page: 5, size: 10 }, WORDS, NOW);
    if (!r.ok) throw new Error("no file");
    expect(r.columns).toEqual(["name", "phone", "visits"]);
    // every page of them, whatever page the list was on
    expect(readXlsx(r.bytes).rows).toEqual([
      ["Имя", "Телефон", "Визиты"],
      ["Eve Sample", "+37255550105", 0],
      ["Anna Näidis", "+37255550101", 0],
    ]);
    // the name alone is a file too
    await setClientColumns(query, owner.id, []);
    const bare = await exportClients(demo.business, owner, { q: "boris" }, WORDS, NOW);
    expect(bare.ok && readXlsx(bare.bytes).rows).toEqual([["Имя"], ["Boris Sample"]]);
  });

  it("only the owner; every export is in the audit with who and how many rows, never the rows", async () => {
    const owner = await login("owner", "renat");
    const desk = await login("admin", "desk");
    const barber = await login("staff", "barber");
    await add({ name: "Anna Näidis", phone: "+372 5555 0101", email: "anna@example.test" });
    await add({ name: "Boris Sample", phone: "+372 5555 0102" });
    expect(await exportClients(demo.business, desk, {}, WORDS, NOW)).toEqual({ ok: false, code: "forbidden" });
    expect(await exportClients(demo.business, barber, {}, WORDS, NOW)).toEqual({ ok: false, code: "forbidden" });
    const log = () => query<{ actor: string; at: Date; entity_id: string | null; after: Record<string, unknown> }>("select actor, at, entity_id, after from audit where entity = 'client' and action = 'export' order by id");
    expect(await log()).toHaveLength(0);

    expect((await exportClients(demo.business, owner, {}, WORDS, NOW)).ok).toBe(true);
    expect((await exportClients(demo.business, owner, { q: "anna" }, WORDS, NOW)).ok).toBe(true);
    const rows = await log();
    expect(rows.map((x) => [x.actor, x.entity_id, x.after])).toEqual([
      [owner.id, null, { by: "admin", rows: 2, columns: ["name", "phone", "email", "sold", "visits", "discount", "last", "first"] }],
      [owner.id, null, { by: "admin", rows: 1, columns: ["name", "phone", "email", "sold", "visits", "discount", "last", "first"] }],
    ]);
    expect(rows[0].at).toBeInstanceOf(Date);
    const all = JSON.stringify(rows);
    for (const secret of ["Anna", "Boris", "5555", "example.test"]) expect(all).not.toContain(secret);
  });

  it("another business's clients are never in the file", async () => {
    const owner = await login("owner", "renat");
    await add({ name: "Anna Näidis" });
    const [other] = await query<{ id: string }>("insert into businesses (slug, name) values ('other-salon', 'Other') returning id");
    await query("insert into clients (business_id, name, phone_e164) values ($1, 'Their Client', '+37255550177')", [other.id]);
    const r = await exportClients(demo.business, owner, {}, WORDS, NOW);
    expect(r.ok && readXlsx(r.bytes).rows.map((x) => x[0])).toEqual(["Имя", "Anna Näidis"]);
  });
});
