import type { ReactNode } from "react"
import { Search } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/registry/new-york-v4/ui/avatar"
import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Kbd, KbdGroup } from "@/registry/new-york-v4/ui/kbd"
import { Label } from "@/registry/new-york-v4/ui/label"
import { Separator } from "@/registry/new-york-v4/ui/separator"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"
import { Spinner } from "@/registry/new-york-v4/ui/spinner"

function LookPair({ classic, scanner }: { classic: ReactNode; scanner: ReactNode }) {
  return (
    <div className="review-scope-pair">
      <p className="review-look-label">Classic (default)</p>
      {classic}
      <p className="review-look-label review-look-scanner">Scanner</p>
      <div data-look="scanner">{scanner}</div>
    </div>
  )
}

function ButtonRow() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Scan apps</Button>
      <Button data-review-state="hover">Hover</Button>
      <Button data-review-state="focus">Focus</Button>
      <Button variant="outline">Details</Button>
      <Button variant="ghost">Settings</Button>
      <Button variant="destructive">Clear results</Button>
      <Button disabled>Unavailable</Button>
      <Button size="icon" variant="outline" aria-label="Search"><Search aria-hidden="true" /></Button>
    </div>
  )
}

function ButtonAtoms() {
  return <LookPair classic={<ButtonRow />} scanner={<ButtonRow />} />
}

function BadgeRow() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Rosetta 2</Badge>
      <Badge variant="outline">Universal</Badge>
      <Badge variant="destructive">Scan failed</Badge>
    </div>
  )
}

function BadgeAtoms() {
  return <LookPair classic={<BadgeRow />} scanner={<BadgeRow />} />
}

function InputRows({ id }: { id: string }) {
  return (
    <div className="review-input-atoms">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-default`}>App name</Label>
        <Input id={`${id}-default`} placeholder="Search apps" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-focus`}>Focused field</Label>
        <Input id={`${id}-focus`} data-review-state="focus" placeholder="App name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-disabled`}>Bundle ID</Label>
        <Input disabled id={`${id}-disabled`} value="com.example.app" readOnly />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-error`}>Download URL</Label>
        <Input id={`${id}-error`} aria-invalid aria-describedby={`${id}-help`} defaultValue="example" />
        <p id={`${id}-help`} className="text-sm text-destructive">Enter a full HTTPS URL.</p>
      </div>
    </div>
  )
}

function InputAtoms() {
  return <LookPair classic={<InputRows id="review-input" />} scanner={<InputRows id="review-input-scanner" />} />
}

function LabelAtoms() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" />
        <Label asChild><span>Show details</span></Label>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" disabled />
        <Label asChild><span className="opacity-50">Unavailable</span></Label>
      </label>
    </div>
  )
}

function TypographyAtoms() {
  return (
    <div className="space-y-2">
      <p className="text-3xl font-normal tracking-tight">Apple Silicon compatibility</p>
      <p className="text-xl font-semibold">App results</p>
      <p className="text-sm text-muted-foreground">Find out which of your apps run natively.</p>
      <code className="rounded bg-muted px-1 text-sm">arm64</code>
    </div>
  )
}

export const atomPreviews = {
  button: ButtonAtoms,
  badge: BadgeAtoms,
  input: InputAtoms,
  label: LabelAtoms,
  kbd: () => <KbdGroup><Kbd aria-label="Command">⌘</Kbd><Kbd>K</Kbd></KbdGroup>,
  separator: () => <div className="flex h-6 items-center gap-3 text-sm"><span>Apps</span><Separator orientation="vertical" /><span>Benchmarks</span></div>,
  spinner: () => <span role="status" className="inline-flex items-center gap-2"><Spinner aria-hidden="true" /> Checking apps</span>,
  avatar: () => (
    <div className="flex items-center gap-3">
      <Avatar><AvatarImage src="/images/mark.png" alt="Does It ARM" /><AvatarFallback>ARM</AvatarFallback></Avatar>
      <Avatar><AvatarFallback aria-label="Visual Studio Code">VS</AvatarFallback></Avatar>
    </div>
  ),
  skeleton: () => (
    <div className="flex items-center gap-3" role="status" aria-label="Loading app listing">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid gap-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-20" /></div>
    </div>
  ),
  typography: TypographyAtoms,
}
