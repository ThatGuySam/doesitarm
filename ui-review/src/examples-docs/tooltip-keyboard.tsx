import { SaveIcon } from "lucide-react"

import { Button } from "@/registry/radix-nova/ui/button"
import { Kbd } from "@/registry/radix-nova/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/registry/radix-nova/ui/tooltip"

export function TooltipKeyboard() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm">
          <SaveIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Save Changes <Kbd>S</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

export default TooltipKeyboard
