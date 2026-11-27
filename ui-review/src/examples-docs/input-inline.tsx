import { Button } from "@/registry/radix-nova/ui/button"
import { Field } from "@/registry/radix-nova/ui/field"
import { Input } from "@/registry/radix-nova/ui/input"

export function InputInline() {
  return (
    <Field orientation="horizontal">
      <Input type="search" placeholder="Search..." />
      <Button>Search</Button>
    </Field>
  )
}

export default InputInline
