"use client";

// The admin's error page: wraps its sections and the login (src/components/staff-error.tsx).
import { StaffError } from "@/components/staff-error";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return <StaffError error={error} retry={retry} home="/admin" />;
}
