type Sample = { id: string; label: string; source: string }
type Collection = "components" | "compositions"

const files = import.meta.glob<{ default: Sample[] }>("./catalog-data/*/*.json")
const loaded = new Map<string, Promise<Sample[]>>()

export function loadExamples(collection: Collection, id: string) {
  const key = `./catalog-data/${collection}/${id}.json`
  const existing = loaded.get(key)
  if (existing) return existing

  const result = files[key]().then(module => module.default)
  loaded.set(key, result)
  return result
}
