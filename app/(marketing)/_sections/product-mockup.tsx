const MOCK_DAYS = [
  { abbr: "LUN", num: 13 },
  { abbr: "MAR", num: 14 },
  { abbr: "MIÉ", num: 15 },
  { abbr: "JUE", num: 16 },
]

const MOCK_SHIFTS: { label: string; time: string; cells: { name: string; hl?: boolean }[][] }[] = [
  {
    label: "T1", time: "7:30–15:30",
    cells: [
      [{ name: "Amira" }, { name: "Carla" }],
      [{ name: "Dina" }, { name: "Sara" }],
      [{ name: "Dina" }, { name: "Yuki", hl: true }],
      [{ name: "Amira" }, { name: "Mei" }],
    ],
  },
  {
    label: "T2", time: "8:00–16:00",
    cells: [
      [{ name: "Fatima" }, { name: "Priya" }],
      [{ name: "Amira" }, { name: "Fatima" }],
      [{ name: "Carla" }, { name: "Priya" }],
      [{ name: "Carla" }, { name: "Fatima" }],
    ],
  },
  {
    label: "T4", time: "9:00–17:00",
    cells: [
      [{ name: "Yuki", hl: true }, { name: "Noor" }],
      [{ name: "Noor" }],
      [{ name: "Leila" }, { name: "Noor" }],
      [{ name: "Sara" }, { name: "Noor" }],
    ],
  },
]

function Chip({ name, hl }: { name: string; hl?: boolean }) {
  return (
    <span className={`inline-block rounded-md px-2 py-[3px] text-[11px] font-medium leading-tight whitespace-nowrap ${
      hl ? "bg-[#2563eb] text-white" : "bg-white border border-[#ccddee] text-[#334155]"
    }`}>{name}</span>
  )
}

export function ProductMockup() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(27,79,138,0.18),0_4px_16px_rgba(27,79,138,0.1)] border border-[#e2e8f0] text-left select-none bg-white flex flex-col">

      {/* ── Browser chrome ── */}
      <div className="bg-[#f8fafc] border-b border-[#e2e8f0] h-9 flex items-center px-3 gap-2 flex-shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#fca5a5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#fcd34d]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#6ee7b7]" />
        </div>
        <div className="flex-1 mx-3 bg-white border border-[#e2e8f0] rounded-md h-5 flex items-center px-2">
          <span className="text-[9px] text-[#94a3b8]">www.labrota.app</span>
        </div>
      </div>

      {/* ── App shell ── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <div className="bg-[#0f172a] w-[56px] flex-shrink-0 flex flex-col items-center pt-3 pb-3 gap-0.5">
          {[
            { icon: "▦", label: "Horarios", active: true },
            { icon: "⚗", label: "Lab" },
            { icon: "👥", label: "Equipo" },
            { icon: "✈", label: "Ausencias" },
            { icon: "▤", label: "Informes" },
          ].map(item => (
            <div key={item.label} className={`w-full flex flex-col items-center py-2 gap-[3px] ${item.active ? "bg-[#1e3a5f]" : ""}`}>
              <span className={`text-[12px] leading-none ${item.active ? "text-[#60a5fa]" : "text-[#475569]"}`}>{item.icon}</span>
              <span className={`text-[7px] font-medium leading-none ${item.active ? "text-[#93c5fd]" : "text-[#475569]"}`}>{item.label}</span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-[7px] text-[#334155] font-bold tracking-tight">lab<span className="text-[#3b82f6]">rota</span></span>
        </div>

        {/* Main */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Toolbar */}
          <div className="border-b border-[#e2e8f0] px-3 h-10 flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-[#0f172a]">IVF Clinic Abu Dhabi</span>
            <div className="flex-1" />
            <span className="text-[9px] text-[#64748b]">13–16 Abr</span>
            <span className="text-[9px] font-semibold text-white bg-[#1b4f8a] rounded px-2 py-0.5">Generar IA</span>
          </div>

          {/* Grid */}
          <div className="flex-1">

            {/* Day headers */}
            <div className="grid border-b border-[#e2e8f0] bg-[#f8fafc]" style={{ gridTemplateColumns: "60px repeat(4, 1fr)" }}>
              <div />
              {MOCK_DAYS.map(d => (
                <div key={d.num} className="text-center py-2 border-l border-[#e2e8f0]">
                  <div className="text-[8px] font-bold uppercase tracking-wide text-[#94a3b8]">{d.abbr}</div>
                  <div className="text-[15px] font-bold text-[#0f172a] leading-tight">{d.num}</div>
                </div>
              ))}
            </div>

            {/* Shift rows */}
            {MOCK_SHIFTS.map(shift => (
              <div key={shift.label} className="grid border-b border-[#e2e8f0]" style={{ gridTemplateColumns: "60px repeat(4, 1fr)" }}>
                <div className="flex flex-col justify-center px-2 py-2 border-r border-[#e2e8f0] bg-[#f8fafc]">
                  <span className="text-[11px] font-bold text-[#1b4f8a]">{shift.label}</span>
                  <span className="text-[8px] text-[#94a3b8] leading-tight">{shift.time}</span>
                </div>
                {shift.cells.map((staff, di) => (
                  <div key={di} className="p-2 border-l border-[#e2e8f0] flex flex-col gap-1">
                    {staff.map(s => <Chip key={s.name} name={s.name} hl={s.hl} />)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* AI footer */}
          <div className="border-t border-[#e2e8f0] px-3 h-8 flex items-center gap-2 bg-[#eff6ff]">
            <span className="text-[10px]">✨</span>
            <span className="text-[9px] font-semibold text-[#1b4f8a]">Rota generated by AI</span>
            <span className="text-[9px] text-[#94a3b8]">·</span>
            <span className="text-[9px] text-[#16a34a] font-semibold">0 skill gaps</span>
            <div className="flex-1" />
            <span className="text-[9px] text-[#94a3b8]">in 4s</span>
          </div>
        </div>
      </div>
    </div>
  )
}
