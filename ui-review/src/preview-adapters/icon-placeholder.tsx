import { SquareIcon, type LucideIcon, type LucideProps } from "lucide-react"

import * as icons from "@/registry/icons/__lucide__"

type Props = LucideProps & {
  lucide?: string
  tabler?: string
  hugeicons?: string
  phosphor?: string
  remixicon?: string
}

const iconByName: Record<string, LucideIcon> = icons

export function IconPlaceholder({ lucide, tabler, hugeicons, phosphor, remixicon, ...props }: Props) {
  const Icon = lucide ? iconByName[lucide] ?? SquareIcon : SquareIcon
  return <Icon aria-hidden="true" {...props} />
}
