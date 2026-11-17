"use client";

import { useTitle } from "../lang";

/** The browser tab's title from a server page. */
export function Title({ text }: { text: string }) {
  useTitle(text);
  return null;
}
