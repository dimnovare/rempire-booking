/**
 * Isolta's old invoices as history (src/lib/billing/isolta.ts,
 * scripts/import-isolta-invoices.ts, 027_invoice_import.sql): the CSV and
 * Finvoice readers, the receiver matching, drafts left out, a credit linked,
 * the dry run that writes nothing, a second run that changes nothing, and
 * the imported invoices in our list, PDF and events.
 *
 * Every company, person, code and sum here is invented, written in the
 * shapes Isolta's export uses (invoices.csv with dot decimals, Finvoice 3.0
 * in ISO-8859-15 with comma decimals and CCYYMMDD dates).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { invoiceEvents, latestEvents, receiverEvents } from "@/lib/billing/events";
import { sectionRows } from "@/lib/billing/export";
import { invoiceById, invoiceLines, planInvoiceDrafts } from "@/lib/billing/invoices";
import {
  applyIsoltaImport,
  csvRecords,
  decodeXmlBytes,
  isoltaReport,
  nameKey,
  numberRanges,
  parseAmount,
  parseCsv,
  parseDay,
  parseDecimal,
  parseFinvoice,
  parseXml,
  planIsoltaImport,
  readIsoltaExport,
  receiverKindOf,
  xmlFind,
} from "@/lib/billing/isolta";
import { invoicePdf } from "@/lib/billing/send";
import { closeDb, query } from "@/lib/db";
import { zonedToUtc } from "@/lib/tz";
import { run } from "../scripts/import-isolta-invoices";
import { freshDemo, type Demo } from "./helpers";

const TZ = "Europe/Tallinn";
const NOW = zonedToUtc("2026-11-19", "10:00", TZ);

/* ---------- an invented export in Isolta's shapes ---------- */

/** ISO-8859-15, as Isolta writes its Finvoice files: «€» is 0xA4, «Š» 0xA6. */
const LATIN9: Record<string, number> = { "€": 0xa4, Š: 0xa6, š: 0xa8, Ž: 0xb4, ž: 0xb8, Œ: 0xbc, œ: 0xbd, Ÿ: 0xbe };
function latin9(s: string): Uint8Array {
  return Uint8Array.from([...s].map((c) => LATIN9[c] ?? (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 0x3f)));
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ymd = (d: string) => d.replace(/-/g, "");

type FakeRow = { id?: string; name?: string; qty?: string; unit: string; amount: string; vat?: string };
type FakeDoc = {
  number: string;
  date: string;
  due: string;
  buyer: { name: string; reg?: string; dept?: string; street?: string; post?: string; town?: string; email?: string };
  rows: FakeRow[];
  total: string;
  credit?: { original: string };
  lang?: string;
};

function finvoice(o: FakeDoc): string {
  const b = o.buyer;
  const rows = o.rows
    .map(
      (r, i) => `<InvoiceRow>
<ArticleIdentifier>${esc(r.id ?? "")}</ArticleIdentifier>
<ArticleName>${esc(r.name ?? "")}</ArticleName>
<DeliveredQuantity QuantityUnitCodeUN="C62">${r.qty ?? "1,0000"}</DeliveredQuantity>
<InvoicedQuantity QuantityUnitCodeUN="C62">${r.qty ?? "1,0000"}</InvoicedQuantity>
<UnitPriceAmount AmountCurrencyIdentifier="EUR" QuantityUnitCodeUN="C62">${r.unit}</UnitPriceAmount>
<UnitPriceNetAmount AmountCurrencyIdentifier="EUR" QuantityUnitCodeUN="C62">${r.unit}</UnitPriceNetAmount>
<RowPositionIdentifier>${i + 1}</RowPositionIdentifier>
<RowVatRatePercent>${r.vat ?? "0,00"}</RowVatRatePercent>
<RowVatExcludedAmount AmountCurrencyIdentifier="EUR">${r.amount}</RowVatExcludedAmount>
<RowAmount AmountCurrencyIdentifier="EUR">${r.amount}</RowAmount>
</InvoiceRow>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="ISO-8859-15"?>
<Finvoice Version="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Finvoice3.0.xsd">
<SellerPartyDetails>
<SellerPartyIdentifier>00000001</SellerPartyIdentifier>
<SellerOrganisationName>Näidis Salong OÜ</SellerOrganisationName>
<SellerPostalAddressDetails>
<SellerStreetName>Näidise 1-1</SellerStreetName>
<SellerTownName>Tallinn</SellerTownName>
<SellerPostCodeIdentifier>10111</SellerPostCodeIdentifier>
<CountryCode>EE</CountryCode>
<CountryName>Estonia</CountryName>
</SellerPostalAddressDetails>
</SellerPartyDetails>
<SellerOrganisationUnitNumber>003700000000</SellerOrganisationUnitNumber>
<SellerInformationDetails>
<SellerWebaddressIdentifier>www.example.test</SellerWebaddressIdentifier>
<SellerAccountDetails>
<SellerAccountID IdentificationSchemeName="IBAN">EE000000000000000001</SellerAccountID>
<SellerBic IdentificationSchemeName="BIC"></SellerBic>
</SellerAccountDetails>
</SellerInformationDetails>
<InvoiceRecipientLanguageCode>${o.lang ?? "et"}</InvoiceRecipientLanguageCode>
<BuyerPartyDetails>
<BuyerPartyIdentifier>${b.reg ?? ""}</BuyerPartyIdentifier>
<BuyerOrganisationName>${esc(b.name)}</BuyerOrganisationName>
${b.dept ? `<BuyerOrganisationDepartment>${esc(b.dept)}</BuyerOrganisationDepartment>` : ""}
<BuyerPostalAddressDetails>
<BuyerStreetName>${esc(b.street ?? "")}</BuyerStreetName>
<BuyerTownName>${esc(b.town ?? "")}</BuyerTownName>
<BuyerPostCodeIdentifier>${b.post ?? ""}</BuyerPostCodeIdentifier>
<CountryCode>EE</CountryCode>
<CountryName>Estonia</CountryName>
</BuyerPostalAddressDetails>
</BuyerPartyDetails>
<BuyerOrganisationUnitNumber></BuyerOrganisationUnitNumber>
<BuyerCommunicationDetails>
<BuyerEmailaddressIdentifier>${b.email ?? ""}</BuyerEmailaddressIdentifier>
</BuyerCommunicationDetails>
<InvoiceDetails>
<InvoiceTypeCode>${o.credit ? "INV02" : "INV01"}</InvoiceTypeCode>
<InvoiceTypeCodeUN>${o.credit ? "381" : "380"}</InvoiceTypeCodeUN>
<InvoiceTypeText>${o.credit ? "HYVITYSLASKU" : "LASKU"}</InvoiceTypeText>
<OriginCode>Original</OriginCode>
<InvoiceNumber>${o.number}</InvoiceNumber>
<InvoiceDate Format="CCYYMMDD">${ymd(o.date)}</InvoiceDate>
${o.credit ? `<OriginalInvoiceNumber>${o.credit.original}</OriginalInvoiceNumber>` : ""}
<RowsTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">${o.total}</RowsTotalVatExcludedAmount>
<InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">${o.total}</InvoiceTotalVatExcludedAmount>
<InvoiceTotalVatAmount AmountCurrencyIdentifier="EUR">0,00</InvoiceTotalVatAmount>
<InvoiceTotalVatIncludedAmount AmountCurrencyIdentifier="EUR">${o.total}</InvoiceTotalVatIncludedAmount>
<VatSpecificationDetails>
<VatBaseAmount AmountCurrencyIdentifier="EUR">${o.total}</VatBaseAmount>
<VatRatePercent>0,00</VatRatePercent>
<VatRateAmount AmountCurrencyIdentifier="EUR">0,00</VatRateAmount>
<VatFreeText></VatFreeText>
</VatSpecificationDetails>
<PaymentTermsDetails>
<PaymentTermsFreeText>5 päeva</PaymentTermsFreeText>
<InvoiceDueDate Format="CCYYMMDD">${ymd(o.due)}</InvoiceDueDate>
<PaymentOverDueFineDetails>
<PaymentOverDueFinePercent>0,00</PaymentOverDueFinePercent>
</PaymentOverDueFineDetails>
</PaymentTermsDetails>
</InvoiceDetails>
${rows}
<EpiDetails>
<EpiIdentificationDetails>
<EpiDate Format="CCYYMMDD">${ymd(o.date)}</EpiDate>
<EpiReference></EpiReference>
</EpiIdentificationDetails>
<EpiPartyDetails>
<EpiBfiPartyDetails>
<EpiBfiIdentifier IdentificationSchemeName="BIC"></EpiBfiIdentifier>
<EpiBfiName>Demo Pank</EpiBfiName>
</EpiBfiPartyDetails>
<EpiBeneficiaryPartyDetails>
<EpiNameAddressDetails>Näidis Salong OÜ</EpiNameAddressDetails>
<EpiAccountID IdentificationSchemeName="IBAN">EE000000000000000001</EpiAccountID>
</EpiBeneficiaryPartyDetails>
</EpiPartyDetails>
<EpiPaymentInstructionDetails>
<EpiRemittanceInfoIdentifier IdentificationSchemeName="ISO">10${o.number}</EpiRemittanceInfoIdentifier>
<EpiInstructedAmount AmountCurrencyIdentifier="EUR">${o.total}</EpiInstructedAmount>
<EpiCharge ChargeOption="SLEV"></EpiCharge>
<EpiDateOptionDate Format="CCYYMMDD">${ymd(o.due)}</EpiDateOptionDate>
<EpiPaymentMeansCode>58</EpiPaymentMeansCode>
</EpiPaymentInstructionDetails>
</EpiDetails>
</Finvoice>
`;
}

const JEVGENI = { name: "Näidis Juuksur OÜ (Jevgeni)", reg: "00000003", street: "Näidise 3-3", post: "10111", town: "Tallinn", email: "jevgeni@example.test" };
const NEW_FIE = { name: "Habemeajaja FIE", reg: "10000009", dept: "Kalle Näidis", street: "Proovi 9", post: "10112", town: "Tallinn", email: "kalle@example.test" };
const SLAVA_NO_REG = { name: "Näidis FIE (Slava)", email: "slava@example.test" };
const PERSON = { name: "Mari Maasikas", email: "mari@example.test" };

/** id → [csv row, Finvoice or null] */
const DOCS: Record<string, { csv: string; doc: FakeDoc | null }> = {
  // a barber's company that is ours, by its registry code; dated the 1st of October
  "1001": {
    csv: `1001,NotModified,1,101,2026-10-01,2026-10-06,,${JEVGENI.name},350.0000,350.0000,0.0000,EUR,`,
    doc: { number: "1", date: "2026-10-01", due: "2026-10-06", buyer: JEVGENI, rows: [{ name: "teenused", unit: "350,00", amount: "350,00" }], total: "350,00" },
  },
  // a company we do not have: made, switched off. Its text went into the item-number column
  "1002": {
    csv: `1002,IsModified,2,102,2024-02-01,2024-02-15,,${NEW_FIE.name},120.0000,120.0000,0.0000,EUR,`,
    doc: { number: "2", date: "2024-02-01", due: "2024-02-15", buyer: NEW_FIE, rows: [{ id: "teenused veebruar", unit: "120,00", amount: "120,00" }], total: "120,00" },
  },
  // ours by name: written without its registry code; a quantity that is not whole
  "1003": {
    csv: `1003,Open,3,103,2025-03-02,2025-03-07,,${SLAVA_NO_REG.name},25.0000,25.0000,0.0000,EUR,`,
    doc: { number: "3", date: "2025-03-02", due: "2025-03-07", buyer: SLAVA_NO_REG, rows: [{ name: "teenused", qty: "2,5000", unit: "10,00", amount: "25,00" }], total: "25,00" },
  },
  // the modification in progress of #3: a draft with the same number
  "1004": { csv: `1004,Draft,3,103,2025-03-02,2025-03-07,,${SLAVA_NO_REG.name},25.0000,25.0000,0.0000,EUR,`, doc: null },
  // never sent: no number; a memo over two lines, with quotes and a comma
  "1005": { csv: `1005,NotModified,,,2026-11-19,2026-12-03,,,0.0000,0.0000,0.0000,EUR,"Esimene rida, ""tsitaat""\nteine rida"`, doc: null },
  // a credit invoice for #2
  "1006": {
    csv: `1006,NotModified,4,104,2024-03-01,2024-03-06,,${NEW_FIE.name},-120.0000,-120.0000,0.0000,EUR,`,
    doc: { number: "4", date: "2024-03-01", due: "2024-03-06", buyer: NEW_FIE, rows: [{ id: "teenused veebruar", qty: "-1,0000", unit: "120,00", amount: "-120,00" }], total: "-120,00", credit: { original: "2" } },
  },
  // a private person, paid
  "1007": {
    csv: `1007,NotModified,5,105,2026-11-01,2026-11-15,2026-11-05,${PERSON.name},40.0000,40.0000,0.0000,EUR,`,
    doc: { number: "5", date: "2026-11-01", due: "2026-11-15", buyer: PERSON, rows: [{ name: "Habeme piiramine", unit: "40,00", amount: "40,00" }], total: "40,00", lang: "ru" },
  },
  // numbered, but its Finvoice file is missing
  "1008": { csv: `1008,NotModified,6,106,2026-11-02,2026-11-07,,${PERSON.name},10.0000,10.0000,0.0000,EUR,`, doc: null },
};

const INVOICES_CSV = `id,modificationState,number,reference,date,dueDate,paymentDate,recipient,vatExclusiveTotal,vatInclusiveTotal,vatTotal,currency,memo\n${Object.values(DOCS)
  .map((d) => d.csv)
  .join("\n")}\n`;

const CONTACTS_CSV = [
  "id,name,contactType,addresses.0.streetAddress,addresses.0.supplement,addresses.0.zipCode,addresses.0.city,addresses.0.countryCode,addresses.0.countryName,email,phoneNumber,billingAddress.streetAddress,billingAddress.supplement,billingAddress.zipCode,billingAddress.city,billingAddress.countryCode,billingAddress.countryName,memo,customerNumber,languageCode,vatNumber,nInvoices,archived,preferredInvoicingMethod,firstName,lastName,businessId,department,secondDepartment",
  `2001,${NEW_FIE.name},1,Proovi 9,,10112,Tallinn,EE,,kalle@example.test,,Proovi 9,,10112,Tallinn,EE,,,,et,,2,0,,,,10000009,Kalle Näidis,`,
  `2002,${PERSON.name},2,,,,,EE,,mari@example.test,+37200000000,,,,,EE,,,,ru,,1,0,,Mari,Maasikas,,,`,
].join("\n");

function exportFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>([
    ["invoices.csv", new TextEncoder().encode(INVOICES_CSV)],
    ["contacts.csv", new TextEncoder().encode(CONTACTS_CSV)],
    ["metadata.csv", new TextEncoder().encode("name,nextInvoiceNumber\nNäidis Salong OÜ,34\n")],
  ]);
  for (const [id, d] of Object.entries(DOCS)) if (d.doc) files.set(`finvoices/invoice-${id}.xml`, latin9(finvoice(d.doc)));
  return files;
}

const counts = async () => {
  const [r] = await query<{ inv: number; rcv: number; lines: number; audit: number; counters: string }>(
    `select (select count(*)::int from invoices) as inv, (select count(*)::int from invoice_receivers) as rcv, (select count(*)::int from invoice_lines) as lines,
            (select count(*)::int from audit) as audit, (select coalesce(string_agg(issuer_id || ':' || year || ':' || last, ',' order by issuer_id, year), '') from invoice_counters) as counters`,
  );
  return r;
};

/* ---------- the readers ---------- */

describe("CSV", () => {
  it("reads quoted fields with commas, doubled quotes and line breaks, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, ""y""\nz",\r\n\r\n2,plain,"last"\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", 'x, "y"\nz', ""],
      ["2", "plain", "last"],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gives records by the header and names a row with the wrong number of fields", () => {
    const { records, bad } = csvRecords('id,memo\n1,"two\nlines"\n2,a,b\n3,\n');
    expect(records.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(records[0].memo).toBe("two\nlines");
    expect(bad).toEqual([2]);
  });

  it("turns Isolta's amounts, quantities and days into cents, numbers and ISO days", () => {
    expect(parseAmount("1234.5600")).toBe(123456);
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("-120,00")).toBe(-12000);
    expect(parseAmount("12,5")).toBe(1250);
    expect(parseAmount("0.0050")).toBe(1);
    expect(parseAmount("0.0049")).toBe(0);
    expect(parseAmount("-0.0000")).toBe(0);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12a")).toBeNull();
    expect(parseDecimal("1,0000")).toBe(1);
    expect(parseDecimal("-2.5")).toBe(-2.5);
    expect(parseDecimal("x")).toBeNull();
    expect(parseDay("20261101")).toBe("2026-11-01");
    expect(parseDay("2026-11-01")).toBe("2026-11-01");
    expect(parseDay("1.11.2026")).toBe("2026-11-01");
    expect(parseDay("20261301")).toBeNull();
    expect(parseDay("2025-02-29")).toBeNull();
    expect(parseDay("")).toBeNull();
  });
});

describe("XML and Finvoice", () => {
  it("decodes the encoding the declaration names (ISO-8859-15: € and Š), and UTF-8 with a BOM", () => {
    expect(decodeXmlBytes(latin9('<?xml version="1.0" encoding="ISO-8859-15"?><a>€ Š õäöü</a>'))).toContain("<a>€ Š õäöü</a>");
    expect(decodeXmlBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("<a>õ</a>")]))).toBe("<a>õ</a>");
    expect(decodeXmlBytes(new TextEncoder().encode('<?xml version="1.0" encoding="no-such-thing"?><a>õ</a>'))).toContain("<a>õ</a>");
  });

  it("reads elements, attributes, entities, CDATA and comments, and refuses what is not well formed", () => {
    const x = parseXml(`<?xml version="1.0"?><!-- a note --><r a="1 > 0" b='x'><c>A &amp; B &#245; &#xE4;</c><d/><e><![CDATA[<raw>]]></e></r>`);
    expect(x.name).toBe("r");
    expect(x.attrs).toEqual({ a: "1 > 0", b: "x" });
    expect(xmlFind(x, "c")?.text).toBe("A & B õ ä");
    expect(xmlFind(x, "d")?.children).toEqual([]);
    expect(xmlFind(x, "e")?.text).toBe("<raw>");
    expect(() => parseXml("<a><b></a>")).toThrow();
    expect(() => parseXml("<a>")).toThrow();
    expect(() => parseXml('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>')).toThrow(/DOCTYPE/);
  });

  it("reads a Finvoice invoice: parties, the row, totals, terms", () => {
    const f = parseFinvoice(decodeXmlBytes(latin9(finvoice(DOCS["1002"].doc!))));
    expect(f).toMatchObject({ number: "2", date: "2024-02-01", dueDate: "2024-02-15", credit: false, currency: "EUR", language: "et", netCents: 12000, vatCents: 0, grossCents: 12000, reference: "102" });
    expect(f.seller).toMatchObject({ name: "Näidis Salong OÜ", regCode: "00000001", street: "Näidise 1-1", postcode: "10111", town: "Tallinn", iban: "EE000000000000000001", bankName: "Demo Pank" });
    expect(f.buyer).toMatchObject({ name: "Habemeajaja FIE", regCode: "10000009", contact: "Kalle Näidis", email: "kalle@example.test" });
    expect(f.rows).toEqual([{ articleId: "teenused veebruar", articleName: "", freeText: "", qty: 1, unitCents: 12000, unitVatIncludedCents: null, vatBp: 0, vatCents: null, netCents: 12000, grossCents: 12000 }]);
    const c = parseFinvoice(finvoice(DOCS["1006"].doc!));
    expect(c).toMatchObject({ credit: true, originalNumber: "2", grossCents: -12000 });
    expect(() => parseFinvoice("<Invoice/>")).toThrow(/not a Finvoice/);
  });

  it("compares names and guesses a new receiver's kind", () => {
    expect(nameKey("«Näidis  Juuksur» OU")).toBe(nameKey("näidis juuksur OÜ"));
    expect(nameKey("Näidis FIE (Slava)")).toBe("näidis fie slava");
    expect(receiverKindOf("Habemeajaja FIE", "10000009", false)).toBe("fie");
    expect(receiverKindOf("Lõikus OÜ", "10000010", null)).toBe("ou");
    expect(receiverKindOf("Mari Maasikas", "", true)).toBe("person");
    expect(receiverKindOf("Mari Maasikas", "", null)).toBe("person");
    expect(numberRanges(["1", "2", "3", "5", "7", "8", "A1"])).toBe("1–3, 5, 7–8, A1");
  });
});

/* ---------- into the database ---------- */

let demo: Demo;
beforeEach(async () => {
  demo = await freshDemo();
});
afterAll(async () => {
  await closeDb();
});

describe("the import", () => {
  it("reads the export: rows, contacts and Finvoice files by Isolta's id", () => {
    const exp = readIsoltaExport(exportFiles());
    expect(exp.problems).toEqual([]);
    expect(exp.rows.map((r) => r.id)).toEqual(Object.keys(DOCS));
    expect(exp.rows.find((r) => r.id === "1001")).toMatchObject({ state: "NotModified", number: "1", date: "2026-10-01", dueDate: "2026-10-06", paymentDate: null, grossCents: 35000 });
    expect(exp.contacts).toHaveLength(2);
    expect(exp.contacts[1]).toMatchObject({ person: true, regCode: "", locale: "ru" });
    expect([...exp.finvoices.keys()].sort()).toEqual(["1001", "1002", "1003", "1006", "1007"]);
  });

  it("a dry run plans it and writes nothing", async () => {
    const before = await counts();
    const plan = await planIsoltaImport(query, demo.business, readIsoltaExport(exportFiles()), NOW);
    expect(await counts()).toEqual(before);

    expect(plan.insert.map((i) => i.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(plan.skipped.map((s) => [s.ref, s.why])).toEqual([
      ["1004", "draft"],
      ["1008", "no_finvoice"],
      ["1005", "no_number"],
    ]);
    const how = Object.fromEntries(plan.receivers.map((r) => [r.numbers.join(","), r.how]));
    expect(how).toEqual({ "1": "reg", "2,4": "new", "3": "name", "5": "new" });
    expect(plan.receivers.find((r) => r.how === "reg")!.id).toBe((await query<{ id: string }>("select id from invoice_receivers where reg_code = '00000003'"))[0].id);
    expect(plan.warnings.map((w) => [w.number, w.why])).toEqual([["3", "fractional_qty"]]);
    expect(plan.issuers).toHaveLength(1);
    expect(plan.issuers[0]).toMatchObject({ byReg: 5, byDefault: 0, counterLast: null, maxNumber: 5 });

    const text = isoltaReport(plan, null).join("\n");
    expect(text).toContain("DRY RUN: nothing was written");
    expect(text).toContain("To import: 5 invoices (1 of them credit invoices), 415,00 € with VAT");
    expect(text).toContain("2024: 2 invoices, 0,00 €");
    expect(text).toContain("2025: 1 invoice, 25,00 €");
    expect(text).toContain("in our list: 2 «просрочен» (issued, past due, no payment in Isolta), 0 not due yet, 1 paid, 1 credited, 1 credit invoices.");
    expect(text).toContain("Receivers: 4; 1 ours by registry code, 1 ours by name, 2 to make (switched off).");
    expect(text).toContain("Drafts, not imported: 2 (1 never numbered, 1 marked «Draft»)");
    expect(text).toContain("they DISAGREE");
    expect(text).toContain("Isolta id 1008, number 6: no Finvoice file in the export");
    // no client's name, code, address, e-mail or account in what is printed
    for (const secret of [JEVGENI.name, NEW_FIE.name, NEW_FIE.reg, NEW_FIE.dept, PERSON.name, PERSON.email, "Proovi", "EE000000000000000001", "Habeme piiramine"]) expect(text).not.toContain(secret);
  });

  it("writes issued invoices as history, a credit linked, receivers made switched off, and a second run changes nothing", async () => {
    const before = await counts();
    const exp = readIsoltaExport(exportFiles());
    const plan = await planIsoltaImport(query, demo.business, exp, NOW);
    const result = await applyIsoltaImport(query, plan);
    expect(result).toEqual({ receiversCreated: 2, phonesFilled: 0, invoices: 5, credits: 1, lines: 5, raced: 0 });

    const rows = await query<{ number: string; status: string; kind: string; free: boolean; staff_id: string | null; source: string; source_ref: string; issued_on: string; due_on: string; period_from: string; credit_of: string | null; paid_at: Date | null; gross_cents: number; locale: string }>(
      `select number, status, kind, free, staff_id, source, source_ref, to_char(issued_on, 'YYYY-MM-DD') as issued_on, to_char(due_on, 'YYYY-MM-DD') as due_on,
              to_char(period_from, 'YYYY-MM-DD') as period_from, credit_of, paid_at, gross_cents, locale
         from invoices where source = 'isolta' order by number`,
    );
    expect(rows.map((r) => [r.number, r.status, r.kind, r.source_ref, r.gross_cents])).toEqual([
      ["1", "issued", "invoice", "1001", 35000],
      ["2", "credited", "invoice", "1002", 12000],
      ["3", "issued", "invoice", "1003", 2500],
      ["4", "issued", "credit", "1006", -12000],
      ["5", "paid", "invoice", "1007", 4000],
    ]);
    expect(rows.every((r) => r.free && r.staff_id === null && r.period_from === r.issued_on)).toBe(true);
    const [two] = await query<{ id: string }>("select id from invoices where source_ref = '1002'");
    expect(rows[3].credit_of).toBe(two.id);
    expect(rows[4].paid_at).not.toBeNull();
    expect(rows[4].locale).toBe("ru");

    const made = await query<{ kind: string; legal_name: string; reg_code: string; active: boolean; vat_mode: string; terms_days: number; locale: string; email: string; phone: string }>(
      "select kind, legal_name, reg_code, active, vat_mode, terms_days, locale, email, phone from invoice_receivers where not active order by legal_name",
    );
    // the phone is Isolta's contact's (044); the company's contact has none
    expect(made).toEqual([
      { kind: "fie", legal_name: NEW_FIE.name, reg_code: NEW_FIE.reg, active: false, vat_mode: "none", terms_days: 5, locale: "et", email: NEW_FIE.email, phone: "" },
      { kind: "person", legal_name: PERSON.name, reg_code: "", active: false, vat_mode: "none", terms_days: 14, locale: "ru", email: PERSON.email, phone: "+37200000000" },
    ]);

    // the lines as printed: the item-number column's text, a quantity that was not whole
    const inv2 = (await invoiceById(query, demo.business.id, two.id))!;
    expect(inv2).toMatchObject({ imported: true, number: "2", issuedOn: "2024-02-01", dueOn: "2024-02-15", free: true });
    expect(inv2.buyer).toMatchObject({ name: NEW_FIE.name, regCode: NEW_FIE.reg, address: "Proovi 9, 10112 Tallinn", email: NEW_FIE.email });
    expect(inv2.seller).toMatchObject({ name: "Näidis Salong OÜ", regCode: "00000001", address: "Näidise 1-1, 10111 Tallinn", iban: "EE000000000000000001" });
    expect((await invoiceLines(query, two.id)).map((l) => [l.kind, l.text, l.qty, l.unitCents, l.grossCents, l.vatBp])).toEqual([["other", "teenused veebruar", 1, 12000, 12000, 0]]);
    const [three] = await query<{ id: string }>("select id from invoices where source_ref = '1003'");
    expect((await invoiceLines(query, three.id)).map((l) => [l.qty, l.unitCents, l.discountCents, l.grossCents])).toEqual([[1, 2500, 0, 2500]]);
    const [credit] = await query<{ id: string }>("select id from invoices where source_ref = '1006'");
    expect((await invoiceLines(query, credit.id)).map((l) => [l.qty, l.unitCents, l.grossCents])).toEqual([[-1, 12000, -12000]]);

    // our own invoices and the number series are not touched
    const after = await counts();
    expect(after.counters).toBe(before.counters);
    expect(after.inv - before.inv).toBe(5);

    // again: everything is found by Isolta's id, nothing is written
    const again = await planIsoltaImport(query, demo.business, exp, NOW);
    expect(again.insert).toEqual([]);
    expect(again.receivers).toEqual([]);
    expect(again.existing.map((e) => e.ref).sort()).toEqual(["1001", "1002", "1003", "1006", "1007"]);
    expect(await applyIsoltaImport(query, again)).toEqual({ receiversCreated: 0, phonesFilled: 0, invoices: 0, credits: 0, lines: 0, raced: 0 });
    expect(await counts()).toEqual(after);
    expect(isoltaReport(again, null).join("\n")).toContain("Already in the database (same Isolta id), left as they are: 5.");
  });

  it("puts Isolta's phone on ours only where it has none, and never prints it", async () => {
    // Jevgeni's company is ours (by its registry code) and has no phone; Isolta's contact has one
    const JEV_PHONE = "+372 5000 0003";
    const withPhone = () => {
      const files = exportFiles();
      const row = `2003,${JEVGENI.name},1,${JEVGENI.street},,${JEVGENI.post},${JEVGENI.town},EE,,${JEVGENI.email},${JEV_PHONE},${JEVGENI.street},,${JEVGENI.post},${JEVGENI.town},EE,,,,et,,1,0,,,,${JEVGENI.reg},,`;
      files.set("contacts.csv", new TextEncoder().encode([CONTACTS_CSV, row].join("\n")));
      return readIsoltaExport(files);
    };
    const [jev] = await query<{ id: string; phone: string }>("select id, phone from invoice_receivers where reg_code = $1", [JEVGENI.reg]);
    expect(jev.phone).toBe("");

    const plan = await planIsoltaImport(query, demo.business, withPhone(), NOW);
    expect(plan.receivers.find((r) => r.id === jev.id)?.fillPhone).toBe(JEV_PHONE);
    const dry = isoltaReport(plan, null).join("\n");
    expect(dry).toContain("phones from Isolta: 1 on the receivers to make, 1 to write on ours that had none.");
    for (const secret of [JEV_PHONE, "+37200000000", "5000"]) expect(dry).not.toContain(secret);

    const result = await applyIsoltaImport(query, plan);
    expect(result).toMatchObject({ phonesFilled: 1, receiversCreated: 2, invoices: 5 });
    expect((await query<{ phone: string }>("select phone from invoice_receivers where id = $1", [jev.id]))[0].phone).toBe(JEV_PHONE);
    const [log] = await query<{ actor: string; after: Record<string, unknown> }>("select actor, after from audit where entity = 'invoice_receiver' and entity_id = $1 and action = 'edit'", [jev.id]);
    expect(log).toMatchObject({ actor: "isolta-import", after: { source: "isolta", phone: true } });
    // the audit says a phone came, not which
    expect(JSON.stringify(log)).not.toContain("5000");
    const written = isoltaReport(plan, result).join("\n");
    expect(written).toContain("1 phones written on ours");
    expect(written).not.toContain(JEV_PHONE);
  });

  it("leaves a phone of ours as it is, even when Isolta has another", async () => {
    await query("update invoice_receivers set phone = '+372 5999 9999' where reg_code = $1", [JEVGENI.reg]);
    const files = exportFiles();
    const row = `2003,${JEVGENI.name},1,,,,,EE,,${JEVGENI.email},+372 5000 0003,,,,,EE,,,,et,,1,0,,,,${JEVGENI.reg},,`;
    files.set("contacts.csv", new TextEncoder().encode([CONTACTS_CSV, row].join("\n")));
    const plan = await planIsoltaImport(query, demo.business, readIsoltaExport(files), NOW);
    expect(plan.receivers.every((r) => r.fillPhone === null)).toBe(true);
    expect(await applyIsoltaImport(query, plan)).toMatchObject({ phonesFilled: 0 });
    expect((await query<{ phone: string }>("select phone from invoice_receivers where reg_code = $1", [JEVGENI.reg]))[0].phone).toBe("+372 5999 9999");
  });

  it("shows the imported ones in our list, PDF and events, and they do not stop the month's draft", async () => {
    await applyIsoltaImport(query, await planIsoltaImport(query, demo.business, readIsoltaExport(exportFiles()), NOW));
    const { rows } = await sectionRows(query, demo.business, undefined, NOW);
    const st = Object.fromEntries(rows.filter((r) => /^[1-5]$/.test(r.number)).map((r) => [r.number, r.status]));
    // no payment was recorded in Isolta: past due is «просрочен», as it was there
    expect(st).toEqual({ "1": "overdue", "2": "credited", "3": "overdue", "4": "credit", "5": "paid" });
    expect(rows.find((r) => r.number === "2")).toMatchObject({ receiver: NEW_FIE.name, date: "2024-02-01", sub: "" });

    const [one] = await query<{ id: string; receiver_id: string }>("select id, receiver_id from invoices where source_ref = '1001'");
    const pdf = await invoicePdf(query, demo.business.id, one.id);
    expect(pdf?.filename).toBe("rempire-arve-1.pdf");
    expect(new TextDecoder().decode(pdf!.bytes.slice(0, 5))).toBe("%PDF-");

    const events = await invoiceEvents(query, demo.business.id, one.id);
    expect(events.map((e) => [e.kind, e.number])).toEqual([["imported", "1"]]);
    expect((await latestEvents(query, demo.business.id, 50)).some((e) => e.kind === "imported")).toBe(false);
    expect((await receiverEvents(query, demo.business.id, one.receiver_id)).some((e) => e.kind === "imported")).toBe(false);

    // Isolta's invoice dated 1 October is free: the cron still makes Jevgeni's October draft
    await planInvoiceDrafts(query, NOW);
    const [draft] = await query<{ n: number }>("select count(*)::int as n from invoices where receiver_id = $1 and status = 'draft' and not free and period_from = '2026-10-01'", [one.receiver_id]);
    expect(draft.n).toBe(1);
  });

  it("skips a number one of our own invoices has, and says when the series agrees", async () => {
    const [issuer] = await query<{ id: string }>("select id from invoice_issuers where is_default");
    const [rcv] = await query<{ id: string }>("select id from invoice_receivers where reg_code = '00000003'");
    await query(
      `insert into invoices (business_id, issuer_id, receiver_id, status, number, period_from, period_to, issued_on, due_on, free) values ($1, $2, $3, 'issued', '5', '2026-11-10', '2026-11-10', '2026-11-10', '2026-11-15', true)`,
      [demo.business.id, issuer.id, rcv.id],
    );
    await query("insert into invoice_counters (issuer_id, year, last) values ($1, 2026, 4)", [issuer.id]);
    const plan = await planIsoltaImport(query, demo.business, readIsoltaExport(exportFiles()), NOW);
    expect(plan.skipped.find((s) => s.ref === "1007")?.why).toBe("number_taken");
    expect(plan.issuers[0]).toMatchObject({ counterLast: 4, maxNumber: 4 });
    expect(isoltaReport(plan, null).join("\n")).toContain("«Последний номер Isolta» is 4, the highest imported number is 4: they agree. Our next number is 5.");
    // the demo company numbers «DEMO-2026-0005»: the report says it does not look like Isolta's
    expect(plan.issuers[0]).toMatchObject({ nextText: "DEMO-2026-0005", plain: false });
    expect(isoltaReport(plan, null).join("\n")).toContain("Our next number prints as «DEMO-2026-0005», Isolta's are bare numbers");
  });

  it("a company numbered as Isolta (no prefix, no year, no padding) goes on with a bare number and no warning", async () => {
    const [issuer] = await query<{ id: string }>("select id from invoice_issuers where is_default");
    await query("update invoice_issuers set prefix = '', digits = 0, yearly = false where id = $1", [issuer.id]);
    await query("insert into invoice_counters (issuer_id, year, last) values ($1, 0, 5)", [issuer.id]);
    const plan = await planIsoltaImport(query, demo.business, readIsoltaExport(exportFiles()), NOW);
    expect(plan.issuers[0]).toMatchObject({ counterLast: 5, maxNumber: 5, nextText: "6", plain: true });
    const text = isoltaReport(plan, null).join("\n");
    expect(text).toContain("they agree. Our next number is 6.");
    expect(text).not.toContain("Our next number prints as");
  });

  it("a credit whose original is not there is left out and named", async () => {
    const files = exportFiles();
    files.delete("finvoices/invoice-1002.xml");
    const plan = await planIsoltaImport(query, demo.business, readIsoltaExport(files), NOW);
    expect(plan.skipped.filter((s) => s.why === "credit_unlinked" || s.why === "no_finvoice").map((s) => s.ref).sort()).toEqual(["1002", "1006", "1008"]);
    expect(plan.insert.map((i) => i.number)).toEqual(["1", "3", "5"]);
  });
});

describe("the command", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "isolta-test-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const writeFolder = (dir: string) => {
    for (const [p, bytes] of exportFiles()) {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), bytes);
    }
  };

  it("--dry-run on the folder and on the zip writes nothing; a run writes; the next finds it all there", async () => {
    const folder = path.join(tmp, "export");
    writeFolder(folder);
    const zip = path.join(tmp, "organization-0-export.zip");
    fs.writeFileSync(zip, zipSync({ ...Object.fromEntries(exportFiles()), "invoices/invoice-1001.pdf": new TextEncoder().encode("%PDF-1.4 fake") }));

    const before = await counts();
    const out: string[] = [];
    const dryFolder = await run([folder, "--dry-run"], (l) => out.push(l), NOW);
    const dryZip = await run([zip, "--business", "rempire", "--dry-run"], (l) => out.push(l), NOW);
    expect(await counts()).toEqual(before);
    expect(dryFolder.result).toBeNull();
    expect(dryZip.plan.insert.map((i) => i.ref)).toEqual(dryFolder.plan.insert.map((i) => i.ref));
    expect(out.join("\n")).toContain("DRY RUN");

    const real = await run([zip, `--business=${demo.business.slug}`], () => {}, NOW);
    expect(real.result).toMatchObject({ invoices: 5, receiversCreated: 2 });
    const second = await run([folder], () => {}, NOW);
    expect(second.result).toMatchObject({ invoices: 0, receiversCreated: 0 });
    expect(second.plan.existing).toHaveLength(5);
  });

  it("refuses an export inside the repository, an unknown option and a salon that is not there", async () => {
    await expect(run([path.join(process.cwd(), "isolta-export"), "--dry-run"])).rejects.toThrow(/outside the repository/);
    await expect(run([tmp, "--force"])).rejects.toThrow(/Unknown option/);
    const folder = path.join(tmp, "export2");
    writeFolder(folder);
    await expect(run([folder, "--business", "no-such-salon", "--dry-run"])).rejects.toThrow(/No salon/);
  });
});
