const design = {
  style: "nova",
  font: "inter",
  fontHeading: "inter",
  iconLibrary: "lucide",
}

export const FONTS = [{ value: "inter", name: "Inter" }]
export const STYLES = [{ name: "nova", title: "Does It ARM" }]

export function useDesignSystemSearchParams() {
  return [design]
}
