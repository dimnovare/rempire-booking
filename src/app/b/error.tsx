"use client";

// The barber app's error page: wraps its tabs and the login (src/components/staff-error.tsx).
import { StaffError } from "@/components/staff-error";

export default function BarberError({ error, retry }: { error: unknown; retry: () => void }) {
  return <StaffError error={error} retry={retry} home="/b" />;
}
