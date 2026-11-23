/**
 * The words of a type's timing, for the list's line under its name and the
 * type page's cards: «SMS за 2 часа, e-mail за 12 часов», «в 10:00 в день
 * рождения». From what is in force (src/lib/admin/notifications.ts,
 * `timing`); no hooks, the dictionary is handed in.
 */
import type { NChannel, Timing, TypeKey } from "@/lib/admin/notifications";
import type { Copy } from "../../copy";

type N = Copy["notif"];

/** One channel's timing; `long` says «до визита» after a lead. */
export function timingText(N: N, t: Timing, long = false): string {
  switch (t.kind) {
    case "now":
      return N.sub.now;
    case "lead":
      return long ? N.leadLong(N.dur(t.min)) : N.lead(N.dur(t.min));
    case "withSms":
      return N.sub.withSms;
    case "delay":
      return N.sub.after(N.dur(t.min));
    case "at":
      return N.sub.at(t.time);
    case "fallback":
      return N.sub.smsFallback(t.time, N.dur(t.min));
    case "delayFallback":
      return N.sub.smsAfterFallback(N.dur(t.min), N.dur(t.after));
  }
}

/** The list's line under a type's name. */
export function summary(N: N, key: TypeKey, channels: { ch: NChannel; on: boolean; timing: Timing }[]): string {
  const first = channels[0]?.timing;
  switch (key) {
    case "reminder": {
      const on = channels.filter((c) => c.on);
      return on.length ? on.map((c) => `${N.chLow[c.ch]} ${timingText(N, c.timing)}`).join(", ") : N.sub.off;
    }
    case "confirmation":
      return N.sub.confirmation;
    case "moved":
      return first?.kind === "delay" ? N.sub.moved(N.dur(first.min)) : N.sub.now;
    case "birthday":
      return first?.kind === "at" ? N.sub.birthday(first.time) : N.sub.now;
    case "no_show":
      return first?.kind === "delay" ? N.sub.noShow(N.dur(first.min)) : N.sub.now;
    case "review_request":
      return first?.kind === "delay" ? N.sub.review(N.dur(first.min)) : N.sub.now;
    case "day_plan":
    case "own_plan":
      return first?.kind === "at" ? N.sub.plan(first.time) : N.sub.now;
    default:
      return N.sub.now;
  }
}
