import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/registry/radix-nova/ui/marker"
import { Spinner } from "@/registry/radix-nova/ui/spinner"

export function ShimmerMarker() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent className="shimmer">Thinking...</MarkerContent>
      </Marker>
      <Marker variant="separator" role="status">
        <MarkerContent className="shimmer">Reading 4 files</MarkerContent>
      </Marker>
    </div>
  )
}

export default ShimmerMarker
