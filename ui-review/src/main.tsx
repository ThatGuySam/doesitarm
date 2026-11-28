import { Component, Suspense, lazy, startTransition, use, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { ArrowUpRight, ChevronDown, Moon, Sun } from "lucide-react"

import { Button } from "@/registry/new-york-v4/ui/button"
import { NativeSelect, NativeSelectOption } from "@/registry/new-york-v4/ui/native-select"
import { Toaster } from "@/registry/new-york-v4/ui/sonner"
import { TooltipProvider } from "@/registry/new-york-v4/ui/tooltip"
import { atomPreviews } from "./atoms"
import catalog from "./catalog.json"
import { loadExamples } from "./catalog-examples"
import { loadPreview } from "./preview-loaders"
import { setTheme, useTheme } from "./preview-adapters/theme"
import "./gallery.css"

const LocalCompositions = lazy(() => import("./local-compositions"))
const LegacyToaster = lazy(() => import("@/registry/legacy/ui/toaster").then(module => ({ default: module.Toaster })))
const atomPreviewById = new Map<string, ComponentType>(Object.entries(atomPreviews))

type ComponentGroup = (typeof catalog.components)[number]

const sectionLinks = [
  { id: "atoms", label: "Atoms" },
  { id: "components", label: "Components" },
  { id: "compositions", label: "Compositions" },
  { id: "does-it-arm", label: "Does It ARM" },
]

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed
      ? <p role="status">This example could not load. Choose another example to continue.</p>
      : this.props.children
  }
}

function LoadingPreview() {
  return <p role="status" className="text-sm text-muted-foreground">Loading preview…</p>
}

function MissingPreview() {
  return <p role="status">Preview unavailable.</p>
}

function preventDemoNavigation(event: FormEvent) {
  const form = event.target
  if (form instanceof HTMLFormElement && !form.getAttribute("action")?.startsWith("javascript:")) {
    event.preventDefault()
  }
}

function Preview({ id }: { id: string }) {
  const Example = useMemo(() => {
    return lazy(async () => await loadPreview(id) ?? { default: MissingPreview })
  }, [id])

  return (
    <PreviewBoundary key={id}>
      <Suspense fallback={<LoadingPreview />}>
        <Example />
      </Suspense>
    </PreviewBoundary>
  )
}

function ExampleControl({ group }: { group: ComponentGroup }) {
  const examples = use(loadExamples("components", group.id))
  const [selected, setSelected] = useState(examples[0].id)
  const example = examples.find(sample => sample.id === selected) ?? examples[0]

  return (
    <>
      <div className="review-preview-tools">
        <label className="review-field">
          <span className="sr-only">Example for {group.label}</span>
          <NativeSelect value={example.id} onChange={event => setSelected(event.currentTarget.value)}>
            {examples.map(sample => <NativeSelectOption key={sample.id} value={sample.id}>{sample.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <a href={example.source} target="_blank" rel="noreferrer" className="review-source-link">
          Source <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </div>
      <div className="review-preview-stage review-live-demo" onSubmit={preventDemoNavigation}>
        <Preview id={example.id} />
        {example.id === "legacy-toast-demo" && <Suspense><LegacyToaster /></Suspense>}
      </div>
    </>
  )
}

function AtomCard({ atom, Preview }: { atom: ComponentGroup; Preview: ComponentType }) {
  const [open, setOpen] = useState(false)

  return (
    <article id={atom.id} className="review-preview-card" data-component={atom.id}>
      <h3>{atom.label}</h3>
      <div className="review-preview-stage"><Preview /></div>
      {atom.exampleCount > 0 && (
        <details className="review-atom-variants" onToggle={event => setOpen(event.currentTarget.open)}>
          <summary><span>Official examples<span className="sr-only"> for {atom.label}</span></span> <ChevronDown size={16} aria-hidden="true" /></summary>
          {open && <Suspense fallback={<LoadingPreview />}><ExampleControl group={atom} /></Suspense>}
        </details>
      )}
    </article>
  )
}

function ComponentCard({ item }: { item: ComponentGroup }) {
  const [open, setOpen] = useState(() => window.location.hash === "#" + item.id)

  return (
    <details
      id={item.id}
      className="review-component-card"
      data-component={item.id}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <span className="review-component-title">{item.label}</span>
          <span className="review-component-count">
            {item.exampleCount === 1 ? "1 example" : `${item.exampleCount} examples`}
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={17} />
      </summary>
      {open && (item.exampleCount > 0
        ? <Suspense fallback={<LoadingPreview />}><ExampleControl group={item} /></Suspense>
        : <a href={item.source} className="review-source-link">Read source <ArrowUpRight aria-hidden="true" size={15} /></a>
      )}
    </details>
  )
}

function CompositionPreview() {
  const [groupId, setGroupId] = useState(catalog.compositions[0].id)
  const [previewId, setPreviewId] = useState("")
  const { theme } = useTheme()
  const examples = use(loadExamples("compositions", groupId))
  const example = examples.find(sample => sample.id === previewId) ?? examples[0]
  const [phone, setPhone] = useState(false)

  return (
    <>
      <div className="review-composition-toolbar">
        <label className="review-field">
          <span>Collection</span>
          <NativeSelect value={groupId} onChange={event => {
            const nextGroup = event.currentTarget.value
            startTransition(() => setGroupId(nextGroup))
          }}>
            {catalog.compositions.map(section => <NativeSelectOption key={section.id} value={section.id}>{section.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label className="review-field">
          <span>Composition</span>
          <NativeSelect value={example.id} onChange={event => setPreviewId(event.currentTarget.value)}>
            {examples.map(sample => <NativeSelectOption key={sample.id} value={sample.id}>{sample.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <div className="review-composition-actions">
          <Button type="button" variant="outline" size="sm" aria-pressed={phone} onClick={() => setPhone(value => !value)}>
            Phone width
          </Button>
          <a href={example.source} target="_blank" rel="noreferrer" className="review-source-link">
            Source <ArrowUpRight aria-hidden="true" size={15} />
          </a>
        </div>
      </div>
      <iframe
        className="review-composition-frame"
        data-width={phone ? "phone" : "auto"}
        title={example.label}
        src={`?preview=${encodeURIComponent(example.id)}&theme=${theme}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </>
  )
}

function CompositionGallery() {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: "240px" })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={container} className="review-compositions">
      {visible && <Suspense fallback={<LoadingPreview />}><CompositionPreview /></Suspense>}
    </div>
  )
}

// A deep link such as #does-it-arm lands on content above it that mounts late.
// Re-align whenever the page height changes, until the reader scrolls or a few
// seconds pass.
function keepDeepLinkInView() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  const target = id ? document.getElementById(id) : null
  if (!target) return
  target.scrollIntoView()
  const settle = new ResizeObserver(() => target.scrollIntoView())
  const stop = () => {
    settle.disconnect()
    window.clearTimeout(timer)
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(type, stop)
  }
  const timer = window.setTimeout(stop, 4000)
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(type, stop, { passive: true })
  settle.observe(document.body)
  return stop
}

function Gallery() {
  const { theme } = useTheme()
  const [filter, setFilter] = useState("")
  const nextTheme = theme === "dark" ? "light" : "dark"
  const ThemeIcon = theme === "dark" ? Sun : Moon
  const atoms = catalog.atoms.flatMap(atom => {
    const Preview = atomPreviewById.get(atom.id)
    return Preview ? [{ atom, Preview }] : []
  })
  const components = catalog.components.filter(item => item.label.toLowerCase().includes(filter.trim().toLowerCase()))

  useEffect(() => keepDeepLinkInView(), [])

  return (
    <>
      <a className="review-skip-link" href="#review-main">Skip to examples</a>
      <header className="review-header">
        <div className="review-width review-header-inner">
          <a className="review-brand" href="/" aria-label="Does It ARM home">
            <img src="/images/mark.png" alt="" width="32" height="32" />
            <span>Does It ARM</span>
          </a>
          <nav aria-label="Table of contents" className="review-toc">
            {sectionLinks.map(section => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}
          </nav>
          <Button variant="outline" size="icon" aria-label={`Switch to ${nextTheme} theme`} onClick={() => setTheme(nextTheme)}>
            <ThemeIcon aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main id="review-main" className="review-width review-main" tabIndex={-1}>
        <div className="review-intro">
          <h1>UI review</h1>
          <p>shadcn/ui components and Apple Silicon scanner patterns in the Does It ARM theme.</p>
        </div>

        <section id="atoms" aria-labelledby="atoms-heading" className="review-section">
          <div className="review-section-heading"><h2 id="atoms-heading">Atoms</h2></div>
          <div className="review-atom-grid">
            {atoms.map(({ atom, Preview }) => <AtomCard key={atom.id} atom={atom} Preview={Preview} />)}
          </div>
        </section>

        <section id="components" aria-labelledby="components-heading" className="review-section">
          <div className="review-section-heading">
            <h2 id="components-heading">Components</h2>
            <label className="review-field">
              <span className="sr-only">Filter components</span>
              <input type="search" placeholder="Filter components" value={filter} onChange={event => setFilter(event.currentTarget.value)} />
            </label>
          </div>
          <div className="review-component-list">
            {components.map(item => <ComponentCard key={item.id} item={item} />)}
            {components.length === 0 && <p role="status">No components match.</p>}
          </div>
        </section>

        <section id="compositions" aria-labelledby="compositions-heading" className="review-section">
          <div className="review-section-heading"><h2 id="compositions-heading">Compositions</h2></div>
          <CompositionGallery />
        </section>

        <section id="does-it-arm" aria-labelledby="does-it-arm-heading" className="review-section">
          <div className="review-section-heading">
            <h2 id="does-it-arm-heading">Does It ARM</h2>
            <p>Scanner and app-listing examples with sample data.</p>
          </div>
          <Suspense fallback={<LoadingPreview />}><LocalCompositions /></Suspense>
        </section>
      </main>

      <footer className="review-width review-footer">
        shadcn/ui examples are provided under the <a href="https://github.com/shadcn-ui/ui/blob/main/LICENSE.md">MIT license</a>.
      </footer>
      <Toaster theme={theme} />
    </>
  )
}

function IsolatedPreview({ id }: { id: string }) {
  const { theme } = useTheme()

  return (
    <main
      className="review-isolated-preview"
      onSubmit={preventDemoNavigation}
      aria-label="Component preview"
    >
      <Preview id={id} />
      <Toaster theme={theme} />
      {id.startsWith("archive-forms") && <Suspense><LegacyToaster /></Suspense>}
    </main>
  )
}

const mount = document.getElementById("ui-review")
const query = new URLSearchParams(window.location.search)
const preview = query.get("preview")
const requestedTheme = query.get("theme")

if (preview && (requestedTheme === "light" || requestedTheme === "dark")) setTheme(requestedTheme)

if (mount) {
  createRoot(mount).render(
    <TooltipProvider>
      {preview ? <IsolatedPreview id={preview} /> : <Gallery />}
    </TooltipProvider>
  )
}
