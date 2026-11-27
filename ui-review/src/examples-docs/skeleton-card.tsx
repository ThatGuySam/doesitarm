import { Card, CardContent, CardHeader } from "@/registry/radix-nova/ui/card"
import { Skeleton } from "@/registry/radix-nova/ui/skeleton"

export function SkeletonCard() {
  return (
    <Card className="w-full max-w-xs">
      <CardHeader>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent>
        <Skeleton className="aspect-video w-full" />
      </CardContent>
    </Card>
  )
}

export default SkeletonCard
