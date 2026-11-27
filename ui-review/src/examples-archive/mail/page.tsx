import { PreviewImage as Image } from "@/preview-adapters/next"

import { Mail } from "@/examples-archive/mail/components/mail"
import { accounts, mails } from "@/examples-archive/mail/data"

export default function MailPage() {
  return (
    <>
      <div className="md:hidden">
        <Image
          src="/ui-assets/examples/mail-dark.png"
          width={1280}
          height={727}
          alt="Mail"
          className="hidden dark:block"
        />
        <Image
          src="/ui-assets/examples/mail-light.png"
          width={1280}
          height={727}
          alt="Mail"
          className="block dark:hidden"
        />
      </div>
      <div className="hidden flex-col md:flex">
        <Mail
          accounts={accounts}
          mails={mails}
          defaultLayout={undefined}
          navCollapsedSize={4}
        />
      </div>
    </>
  )
}
