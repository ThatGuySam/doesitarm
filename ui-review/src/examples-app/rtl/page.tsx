import { type Metadata } from "@/preview-adapters/next"

import { RtlComponents } from "./components"

export const metadata: Metadata = {
  title: "RTL",
  description: "RTL example page with right-to-left language support.",
}

export function RtlPage() {
  return <RtlComponents />
}

export default RtlPage
