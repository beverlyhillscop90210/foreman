import React from "react";

function App() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text-primary)] flex">
      <div className="w-64 border-r border-[var(--color-border)] p-4">
        <h1 className="text-xl font-bold text-[var(--color-accent)]">Foreman</h1>
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Active Agents</h2>
          {/* Agent list will go here */}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-1/2 border-b border-[var(--color-border)] p-4">
          <h2 className="text-lg font-semibold mb-4">Kanban / QC</h2>
          {/* Kanban board will go here */}
        </div>
        <div className="h-1/2 p-4 flex">
          <div className="w-1/2 border-r border-[var(--color-border)] pr-4">
            <h2 className="text-lg font-semibold mb-4">Telemetry</h2>
            {/* Telemetry will go here */}
          </div>
          <div className="w-1/2 pl-4">
            <h2 className="text-lg font-semibold mb-4">Terminal Output</h2>
            {/* Terminal output will go here */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
