import React from "react";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { BottomBar } from "./components/BottomBar";

function App() {
  return (
    <div className="h-screen w-screen bg-[var(--color-background)] text-[var(--color-text-primary)] flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <TerminalGrid />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}

export default App;
