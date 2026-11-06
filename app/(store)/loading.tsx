import { LoadingGrid } from "@/components/shared/loading-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function StoreLoading() {
  return (
    <div className="container-page space-y-8 py-8" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-72 max-w-full" />
      </div>
      <LoadingGrid count={8} />
    </div>
  );
}
