"use client";

/**
 * The one app's bottom bar in the barber app's half (docs/apps.md, «One app
 * for Renat»): for an owner or the front desk on his own pages here, the
 * very bar of the salon's half (src/components/app-bar.tsx), so «Мой день»
 * is a tab beside «Журнал» and not another app. The layout hands it the
 * login's tabs and their words; only the page that is open is read here.
 */
import { usePathname } from "next/navigation";
import { AppBar, type AppBarProps } from "@/components/app-bar";

export function OwnBar(props: Omit<AppBarProps, "path" | "half" | "className">) {
  return <AppBar {...props} path={usePathname() ?? ""} half="b" className="bx-nav" />;
}
