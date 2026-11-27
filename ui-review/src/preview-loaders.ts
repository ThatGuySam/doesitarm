import type { ComponentType } from "react"

type PreviewModule = { default: ComponentType }
export type PreviewLoader = () => Promise<PreviewModule>

const groups = import.meta.glob<{ previews: Record<string, PreviewLoader> }>("./preview-groups/*.ts")

export async function loadPreview(id: string) {
  let prefix = id
  while (prefix) {
    const key = `./preview-groups/${prefix}.ts`
    if (Object.hasOwn(groups, key)) {
      const { previews } = await groups[key]()
      return Object.hasOwn(previews, id) ? previews[id]() : undefined
    }
    const separator = prefix.lastIndexOf("-")
    prefix = separator < 0 ? "" : prefix.slice(0, separator)
  }
}
