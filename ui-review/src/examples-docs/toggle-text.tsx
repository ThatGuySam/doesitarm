import { ItalicIcon } from "lucide-react"

import { Toggle } from "@/registry/radix-nova/ui/toggle"

export function ToggleText() {
  return (
    <Toggle aria-label="Toggle italic">
      <ItalicIcon />
      Italic
    </Toggle>
  )
}

export default ToggleText
