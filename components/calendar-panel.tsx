export function CalendarPanel() {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Calendar toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            Today
          </button>
          <div className="flex items-center gap-1">
            <button className="rounded-md p-1.5 hover:bg-muted transition-colors text-muted-foreground">
              ‹
            </button>
            <button className="rounded-md p-1.5 hover:bg-muted transition-colors text-muted-foreground">
              ›
            </button>
          </div>
          <h2 className="text-sm font-semibold">March 2026</h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5 text-sm">
          {["Month", "Week", "Day"].map((view) => (
            <button
              key={view}
              className={`rounded-md px-3 py-1 transition-colors ${
                view === "Week" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar placeholder */}
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="text-4xl">📅</div>
          <p className="text-sm font-medium">Calendar coming soon</p>
          <p className="text-xs">Shift scheduling will appear here</p>
        </div>
      </div>
    </main>
  );
}
