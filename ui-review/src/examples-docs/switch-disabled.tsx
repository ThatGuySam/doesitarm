import { Field, FieldLabel } from "@/registry/radix-nova/ui/field"
import { Switch } from "@/registry/radix-nova/ui/switch"

export function SwitchDisabled() {
  return (
    <Field orientation="horizontal" data-disabled className="w-fit">
      <Switch id="switch-disabled-unchecked" disabled />
      <FieldLabel htmlFor="switch-disabled-unchecked">Disabled</FieldLabel>
    </Field>
  )
}

export default SwitchDisabled
