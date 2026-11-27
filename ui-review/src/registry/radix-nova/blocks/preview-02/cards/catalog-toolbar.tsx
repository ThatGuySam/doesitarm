import { Button } from "@/registry/radix-nova/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/registry/radix-nova/ui/input-group"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/registry/radix-nova/ui/toggle-group"
import { IconPlaceholder } from "@/preview-adapters/icon-placeholder"

export function CatalogToolbar() {
  return (
    <div className="flex items-center gap-3">
      <InputGroup className="flex-1">
        <InputGroupAddon>
          <IconPlaceholder
            lucide="SearchIcon"
            tabler="IconSearch"
            hugeicons="Search01Icon"
            phosphor="MagnifyingGlassIcon"
            remixicon="RiSearchLine"
          />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search releases or catalog..." />
      </InputGroup>
      <Button>
        <IconPlaceholder
          lucide="PlusIcon"
          tabler="IconPlus"
          hugeicons="Add01Icon"
          phosphor="PlusIcon"
          remixicon="RiAddLine"
        />
        Upload New Release
      </Button>
      <ToggleGroup type="single" defaultValue="releases" variant="outline">
        <ToggleGroupItem value="all-tracks">All Tracks</ToggleGroupItem>
        <ToggleGroupItem value="releases">Releases</ToggleGroupItem>
        <ToggleGroupItem value="top-earners">Top Earners</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
