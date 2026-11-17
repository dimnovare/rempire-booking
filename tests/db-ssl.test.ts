import { describe, expect, it } from "vitest";
import { sslFor } from "@/lib/db";
import { sslFor as toolSslFor } from "../tools/migrate.mjs";

const RAILWAY = "postgresql://u:p@switchback.proxy.rlwy.net:38161/railway";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

type SslFor = (url: string, env: Record<string, string | undefined>) => unknown;

describe.each<[string, SslFor]>([
  ["src/lib/db.ts", sslFor],
  ["tools/migrate.mjs", toolSslFor as SslFor],
])("sslFor in %s", (_, fn) => {
  it("no TLS for a local database or sslmode=disable", () => {
    expect(fn("postgresql://u:p@localhost:5432/db", {})).toBeUndefined();
    expect(fn("postgresql://u:p@127.0.0.1/db", {})).toBeUndefined();
    expect(fn(`${RAILWAY}?sslmode=disable`, {})).toBeUndefined();
  });

  it("strict by default: public trust store and the host name", () => {
    expect(fn(RAILWAY, {})).toEqual({ rejectUnauthorized: true });
  });

  it("with the database's own CA: chain checked, host name not compared", () => {
    const ssl = fn(RAILWAY, { DATABASE_SSL_CA: `  ${PEM}\n` }) as { rejectUnauthorized: boolean; ca: string; checkServerIdentity: () => unknown };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(PEM);
    expect(ssl.checkServerIdentity()).toBeUndefined();
  });

  it("DATABASE_SSL_NO_VERIFY only with the exact string 1, and it wins over a CA", () => {
    expect(fn(RAILWAY, { DATABASE_SSL_NO_VERIFY: "1", DATABASE_SSL_CA: PEM })).toEqual({ rejectUnauthorized: false });
    expect(fn(RAILWAY, { DATABASE_SSL_NO_VERIFY: "true" })).toEqual({ rejectUnauthorized: true });
  });
});
