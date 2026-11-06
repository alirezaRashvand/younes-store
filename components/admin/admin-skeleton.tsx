import { Skeleton } from "@/components/ui/skeleton";

/** Generic page-shaped placeholder used by admin loading states. */
export function AdminPageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}

/** Full-screen placeholder shown while the admin session is being verified. */
export function AdminShellSkeleton() {
  return (
    <div className="min-h-dvh bg-muted/40 lg:ps-64">
      <div className="h-16 border-b bg-background" />
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <AdminPageSkeleton />
        </div>
      </main>
    </div>
  );
}
