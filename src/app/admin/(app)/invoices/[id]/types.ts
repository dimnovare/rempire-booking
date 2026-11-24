import type { ListStatus } from "@/lib/billing/list";
import type { CardReceiver } from "../sheet-parts";

/** One invoice as its page shows it: a draft's editor and an issued one's sheet read the same. */
export type ViewInvoice = {
  id: string;
  /** as the list shows it: «overdue» for an issued one past its day, «credit» for a credit invoice */
  status: ListStatus;
  kind: "invoice" | "credit";
  /** a free invoice: beside the month's own, only typed lines */
  free: boolean;
  number: string | null;
  /** the reference for the payment, from the number (src/lib/billing/reference.ts); a draft's from `upcoming` */
  reference: string;
  /** a draft: the number it would get if issued now (not reserved); null for an issued one, or when there is no issuer */
  upcoming: string | null;
  /** a draft that cannot be issued yet, as Isolta refuses to send: the issuer has no IBAN, or no address */
  blocked: "no_bank" | "no_address" | null;
  month: string;
  /** who it is from, as it is or will be printed */
  from: string;
  fromAddress: string;
  receiver: CardReceiver;
  receiverId: string;
  /** the month it bills; "" for a free invoice */
  period: string;
  /** the days to pay: the receiver's for a draft, from the two dates once issued */
  termsDays: number | null;
  /** «19.11.2026»; "" for a draft */
  issuedOn: string;
  issuedIso: string;
  dueOn: string;
  /** today in the salon's zone, YYYY-MM-DD */
  today: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string;
  paidOn: string;
  sentOn: string;
  emailStatus: string | null;
  creditOf: { id: string; number: string } | null;
  creditedBy: { id: string; number: string } | null;
  staffId: string | null;
  /** brought over from Isolta (027): «Импортирован из Isolta» instead of «Ещё не отправлен» */
  imported: boolean;
  /** the neighbours in the list as it opens */
  prev: string | null;
  next: string | null;
};

export type ViewLine = { id: string; kind: string; text: string; qty: number; unitCents: number; discountCents: number; vatBp: number; grossCents: number; saleId: string | null; itemNo: string };
