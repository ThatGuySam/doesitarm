import { toast } from "sonner"

import { Button } from "@/registry/radix-nova/ui/button"

export function SonnerDescription() {
  return (
    <Button
      onClick={() =>
        toast("Event has been created", {
          description: "Monday, January 3rd at 6:00pm",
        })
      }
      variant="outline"
      className="w-fit"
    >
      Show Toast
    </Button>
  )
}

export default SonnerDescription
