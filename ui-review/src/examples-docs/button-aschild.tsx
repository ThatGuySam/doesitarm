import { PreviewLink as Link } from "@/preview-adapters/next"

import { Button } from "@/registry/radix-nova/ui/button"

export default function ButtonAsChild() {
  return (
    <Button asChild>
      <Link href="/login">Login</Link>
    </Button>
  )
}
