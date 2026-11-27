import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/registry/radix-nova/ui/field"
import { Input } from "@/registry/radix-nova/ui/input"

export function InputField() {
  return (
    <Field>
      <FieldLabel htmlFor="input-field-username">Username</FieldLabel>
      <Input
        id="input-field-username"
        type="text"
        placeholder="Enter your username"
      />
      <FieldDescription>
        Choose a unique username for your account.
      </FieldDescription>
    </Field>
  )
}

export default InputField
