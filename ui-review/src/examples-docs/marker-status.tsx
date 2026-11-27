import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/registry/radix-nova/ui/marker"
import { Spinner } from "@/registry/radix-nova/ui/spinner"

export function MarkerStatusDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-8 py-12">
      <Marker role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>Compacting conversation</MarkerContent>
      </Marker>
      <Marker variant="separator" role="status">
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>Running tests</MarkerContent>
      </Marker>
    </div>
  )
}

export default MarkerStatusDemo
