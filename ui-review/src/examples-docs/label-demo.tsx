import { Checkbox } from "@/registry/radix-nova/ui/checkbox"
import { Label } from "@/registry/radix-nova/ui/label"

export default function LabelDemo() {
  return (
    <div className="flex gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  )
}
