import { Checkbox } from "@/registry/radix-nova/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/registry/radix-nova/ui/field"

export function CheckboxInvalid() {
  return (
    <FieldGroup className="mx-auto w-56">
      <Field orientation="horizontal" data-invalid>
        <Checkbox
          id="terms-checkbox-invalid"
          name="terms-checkbox-invalid"
          aria-invalid
        />
        <FieldLabel htmlFor="terms-checkbox-invalid">
          Accept terms and conditions
        </FieldLabel>
      </Field>
    </FieldGroup>
  )
}

export default CheckboxInvalid
