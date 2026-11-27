import { useRef, useState, type DragEvent, type ReactNode } from "react"
import { Check, FileSearch, FolderOpen, Settings2, Zap } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/registry/new-york-v4/ui/avatar"
import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/registry/new-york-v4/ui/card"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/registry/new-york-v4/ui/drawer"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/registry/new-york-v4/ui/empty"
import { Label } from "@/registry/new-york-v4/ui/label"
import { Progress } from "@/registry/new-york-v4/ui/progress"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/registry/new-york-v4/ui/sheet"
import { Switch } from "@/registry/new-york-v4/ui/switch"

type Verdict = "native" | "rosetta" | "unknown"

const verdicts = {
  native: "Apple Silicon native",
  rosetta: "Rosetta 2",
  unknown: "Needs review",
} satisfies Record<Verdict, string>

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <Badge variant="outline" data-verdict={verdict}>
      {verdict === "native" && <Check aria-hidden="true" />}
      {verdicts[verdict]}
    </Badge>
  )
}

function DetailsDrawer({ trigger = "View scan details" }: { trigger?: string }) {
  return (
    <Drawer>
      <DrawerTrigger asChild><Button variant="outline">{trigger}</Button></DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="review-drawer-inner">
          <DrawerTitle>Visual Studio Code.app</DrawerTitle>
          <DrawerDescription>Example of a completed local Apple Silicon scan.</DrawerDescription>
        </DrawerHeader>
        <div className="review-drawer-inner grid gap-4 px-4">
          <VerdictBadge verdict="native" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Architecture</dt><dd>arm64, x86_64</dd>
            <dt className="text-muted-foreground">Bundle</dt><dd>com.microsoft.VSCode</dd>
            <dt className="text-muted-foreground">Files checked</dt><dd>92</dd>
          </dl>
        </div>
        <DrawerFooter className="review-drawer-inner">
          <DrawerClose asChild><Button variant="outline">Close details</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function ScanResultRow() {
  return (
    <article className="review-result">
      <Avatar aria-hidden="true"><AvatarFallback><FileSearch /></AvatarFallback></Avatar>
      <div className="min-w-0">
        <h4 className="font-semibold">Visual Studio Code.app</h4>
        <p className="text-sm text-muted-foreground">92 files · 310 ms</p>
        <VerdictBadge verdict="native" />
      </div>
      <DetailsDrawer trigger="View row details" />
    </article>
  )
}

function DropZone() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState("")
  const select = (name: string) => setSelection(`Selected ${name} for the preview.`)

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files.item(0)
    if (file) select(file.name)
  }

  return (
    <div
      className="review-drop-zone"
      data-dragging={dragging}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <FolderOpen className="size-6 text-[var(--review-link)]" aria-hidden="true" />
      <input
        ref={fileInput}
        hidden
        type="file"
        tabIndex={-1}
        aria-label="Choose an app file"
        onChange={event => {
          const file = event.currentTarget.files?.item(0)
          if (file) select(file.name)
          event.currentTarget.value = ""
        }}
      />
      <Button size="lg" className="review-hero-button" onClick={() => fileInput.current?.click()}>
        Select apps
      </Button>
      <p className="text-sm text-muted-foreground">Drop an app here or choose a file.</p>
      <p role="status" className="min-h-5 text-sm">{selection}</p>
    </div>
  )
}

function ProgressStrip() {
  const [value, setValue] = useState(62)

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>{value === 100 ? "Scan complete" : "Checking your apps…"}</p>
        <span className="text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <Progress aria-label="Example scan progress" value={value} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={value === 100} onClick={() => setValue(Math.min(value + 19, 100))}>
          Advance scan
        </Button>
        <Button size="sm" variant="ghost" disabled={value === 0} onClick={() => setValue(0)}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function SettingsSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button variant="outline"><Settings2 aria-hidden="true" /> Scan settings</Button></SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Scan settings</SheetTitle>
          <SheetDescription>Choose how much detail to show with each result.</SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="review-detailed-results">Detailed results</Label>
            <p id="review-detailed-help" className="text-sm text-muted-foreground">Show architectures and scan timing.</p>
          </div>
          <Switch id="review-detailed-results" aria-describedby="review-detailed-help" />
        </div>
        <SheetFooter>
          <SheetClose asChild><Button>Done</Button></SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ScanToast() {
  return (
    <Button variant="outline" onClick={() => toast.success("Example report downloaded", { description: "Apple Silicon scan results · JSON" })}>
      Show download toast
    </Button>
  )
}

function ScanEmpty() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileSearch aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>No apps scanned yet</EmptyTitle>
        <EmptyDescription>Add an app to see its Apple Silicon compatibility here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function AppCard() {
  return (
    <Card>
      <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-3">
        <Avatar aria-hidden="true"><AvatarFallback><Zap /></AvatarFallback></Avatar>
        <div>
          <CardTitle>Visual Studio Code</CardTitle>
          <CardDescription>Developer tools</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <VerdictBadge verdict="native" />
        <Button variant="outline" asChild><a href="/app/visual-studio-code">View app listing</a></Button>
      </CardContent>
    </Card>
  )
}

function LocalPreview({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <article id={id} className="review-preview-card">
      <h3>{title}</h3>
      <div className="review-preview-stage">{children}</div>
    </article>
  )
}

export default function LocalCompositions() {
  return (
    <div className="review-local-grid">
      <LocalPreview id="scan-result-row" title="Scan result row"><ScanResultRow /></LocalPreview>
      <LocalPreview id="verdict-badge" title="Verdict badges">
        <div className="flex flex-wrap gap-2">
          <VerdictBadge verdict="native" />
          <VerdictBadge verdict="rosetta" />
          <VerdictBadge verdict="unknown" />
        </div>
      </LocalPreview>
      <LocalPreview id="drop-zone" title="App drop zone"><DropZone /></LocalPreview>
      <LocalPreview id="progress-strip" title="Scan progress"><ProgressStrip /></LocalPreview>
      <LocalPreview id="details-drawer" title="Scan details drawer"><DetailsDrawer /></LocalPreview>
      <LocalPreview id="settings-sheet" title="Scan settings sheet"><SettingsSheet /></LocalPreview>
      <LocalPreview id="download-toast" title="Download toast"><ScanToast /></LocalPreview>
      <LocalPreview id="empty-scan" title="Empty results"><ScanEmpty /></LocalPreview>
      <LocalPreview id="app-card" title="App listing card"><AppCard /></LocalPreview>
    </div>
  )
}
