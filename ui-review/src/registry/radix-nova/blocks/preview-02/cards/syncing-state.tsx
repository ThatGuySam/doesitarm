import { Button } from "@/registry/radix-nova/ui/button"
import { Card, CardContent } from "@/registry/radix-nova/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/radix-nova/ui/empty"
import { Spinner } from "@/registry/radix-nova/ui/spinner"

export function SyncingState() {
  return (
    <Card>
      <CardContent className="p-0">
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>Syncing your accounts</EmptyTitle>
            <EmptyDescription>
              We&apos;re pulling in your latest transactions. This usually takes
              a few seconds.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">Cancel</Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}
