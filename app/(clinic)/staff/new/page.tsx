import { getTranslations } from "next-intl/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"

export default async function NewStaffPage() {
  const t = await getTranslations("staff")

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium">{t("addStaff")}</h1>
            </div>
            <StaffForm mode="create" />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
