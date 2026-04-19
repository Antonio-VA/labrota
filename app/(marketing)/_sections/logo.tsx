import Image from "next/image"

export function Logo() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[22px] leading-none tracking-tight select-none" aria-label="LabRota">
      <Image src="/brand/Logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px]" />
      <span><span className="font-normal text-[#1B4F8A]">lab</span><span className="font-bold text-[#1B4F8A]">rota</span></span>
    </span>
  )
}
