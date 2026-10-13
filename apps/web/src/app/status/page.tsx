import type { Metadata } from "next";
import { ApiStatus } from "@/features/system/api-status";

export const metadata: Metadata = { title: "System status" };

export default function StatusPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        System status
      </h1>
      <ApiStatus />
    </div>
  );
}
