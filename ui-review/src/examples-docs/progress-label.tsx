import { Field, FieldLabel } from "@/registry/radix-nova/ui/field"
import { Progress } from "@/registry/radix-nova/ui/progress"

export function ProgressWithLabel() {
  return (
    <Field className="w-full max-w-sm">
      <FieldLabel htmlFor="progress-upload">
        <span>Upload progress</span>
        <span className="ml-auto">66%</span>
      </FieldLabel>
      <Progress value={66} id="progress-upload" />
    </Field>
  )
}

export default ProgressWithLabel
