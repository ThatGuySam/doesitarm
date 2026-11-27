import { Button } from "@/registry/radix-nova/ui/button"
import { Textarea } from "@/registry/radix-nova/ui/textarea"

export function TextareaButton() {
  return (
    <div className="grid w-full gap-2">
      <Textarea placeholder="Type your message here." />
      <Button>Send message</Button>
    </div>
  )
}

export default TextareaButton
