import { getTranslations } from "next-intl/server"
import { FileQuestion } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function NotFound() {
  const t = await getTranslations("errors")

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] gap-4 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
        <FileQuestion className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-[18px] font-medium text-foreground">
        {t("notFound")}
      </p>
      <p className="text-[14px] text-muted-foreground max-w-md text-center">
        {t("notFoundDescription")}
      </p>
      <Button variant="outline" render={<Link href="/" />}>
        {t("goHome")}
      </Button>
    </div>
  )
}
