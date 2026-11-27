import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/registry/radix-nova/ui/field"
import { Input } from "@/registry/radix-nova/ui/input"

export function InputFile() {
  return (
    <Field>
      <FieldLabel htmlFor="picture">Picture</FieldLabel>
      <Input id="picture" type="file" />
      <FieldDescription>Select a picture to upload.</FieldDescription>
    </Field>
  )
}

export default InputFile
