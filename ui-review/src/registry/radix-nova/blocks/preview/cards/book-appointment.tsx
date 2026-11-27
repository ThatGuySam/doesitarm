import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/registry/radix-nova/ui/alert"
import { Button } from "@/registry/radix-nova/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/registry/radix-nova/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/registry/radix-nova/ui/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/registry/radix-nova/ui/toggle-group"
import { IconPlaceholder } from "@/preview-adapters/icon-placeholder"

export function BookAppointment() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Book Appointment</CardTitle>
        <CardDescription>Dr. Sarah Chen · Cardiology</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel>Available on March 18, 2026</FieldLabel>
            <ToggleGroup type="multiple" spacing={2} defaultValue={["slot-0"]}>
              {["9:00 AM", "10:30 AM", "11:00 AM", "1:30 PM"].map(
                (time, index) => (
                  <ToggleGroupItem key={time} value={`slot-${index}`}>
                    {time}
                  </ToggleGroupItem>
                )
              )}
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <Alert>
          <AlertTitle>New patient?</AlertTitle>
          <AlertDescription>Please arrive 15 minutes early.</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Book Appointment</Button>
      </CardFooter>
    </Card>
  )
}
