import { ApiStatus } from "@/features/system/api-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16 sm:px-8">
      <header>
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Sitework
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Coordinate work across every site
        </h1>
      </header>
      <ApiStatus />
    </main>
  );
}
