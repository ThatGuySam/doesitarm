import { Field, FieldLabel } from "@/registry/radix-nova/ui/field"
import { Textarea } from "@/registry/radix-nova/ui/textarea"

export function TextareaDisabled() {
  return (
    <Field data-disabled>
      <FieldLabel htmlFor="textarea-disabled">Message</FieldLabel>
      <Textarea
        id="textarea-disabled"
        placeholder="Type your message here."
        disabled
      />
    </Field>
  )
}

export default TextareaDisabled
