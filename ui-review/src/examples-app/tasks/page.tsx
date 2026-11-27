import { type Metadata } from "@/preview-adapters/next"
import { PreviewImage as Image } from "@/preview-adapters/next"
import { z } from "zod"

import { columns } from "./components/columns"
import { DataTable } from "./components/data-table"
import { UserNav } from "./components/user-nav"
import { taskSchema } from "./data/schema"

export const metadata: Metadata = {
  title: "Tasks",
  description: "A task and issue tracker build using Tanstack Table.",
}

import tasksData from "./data/tasks.json"

export default function TaskPage() {
  const tasks = z.array(taskSchema).parse(tasksData)

  return (
    <>
      <div className="md:hidden">
        <Image
          src="/ui-assets/examples/tasks-light.png"
          width={1280}
          height={998}
          alt="Playground"
          className="block dark:hidden"
        />
        <Image
          src="/ui-assets/examples/tasks-dark.png"
          width={1280}
          height={998}
          alt="Playground"
          className="hidden dark:block"
        />
      </div>
      <div className="hidden h-full flex-1 flex-col gap-8 p-8 md:flex">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Welcome back!
            </h2>
            <p className="text-muted-foreground">
              Here&apos;s a list of your tasks for this month.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UserNav />
          </div>
        </div>
        <DataTable data={tasks} columns={columns} />
      </div>
    </>
  )
}
