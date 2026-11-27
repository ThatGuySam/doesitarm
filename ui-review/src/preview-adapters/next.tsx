import type { ComponentProps, CSSProperties, ReactElement } from "react"

export type Metadata = { title?: string; description?: string }

function exampleUrl(href: string) {
  const match = href.match(/^\/examples\/forms(?:\/([a-z-]+))?$/)
  if (!match) return href
  const url = new URL(window.location.href)
  url.searchParams.set("preview", `archive-forms${match[1] ? `-${match[1]}` : ""}`)
  return url.href
}

export function PreviewLink({ href, ...props }: ComponentProps<"a">) {
  return <a href={href ? exampleUrl(href) : undefined} {...props} />
}

export function PreviewImage({
  src,
  fill,
  priority,
  quality,
  style,
  alt = "",
  ...props
}: Omit<ComponentProps<"img">, "src"> & {
  src?: string | { src: string }
  fill?: boolean
  priority?: boolean
  quality?: number
}): ReactElement {
  const path = typeof src === "string" ? src : src?.src
  const fillStyle: CSSProperties | undefined = fill ? { position: "absolute", inset: 0, height: "100%", width: "100%" } : undefined
  return <img src={path} alt={alt} decoding="async" loading={priority ? "eager" : "lazy"} style={{ ...fillStyle, ...style }} {...props} />
}

export function PreviewForm(props: ComponentProps<"form">) {
  return <form {...props} />
}

export function usePathname() {
  const preview = new URLSearchParams(window.location.search).get("preview")
  const section = preview?.replace(/^archive-forms-?/, "")
  return section ? `/examples/forms/${section}` : "/examples/forms"
}

export function Vazirmatn(_options: { subsets: string[] }) {
  return { className: "" }
}
