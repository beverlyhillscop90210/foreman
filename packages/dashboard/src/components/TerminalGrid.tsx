import { Terminal as TerminalIcon, Maximize2, X, Minus } from "lucide-react";

export function TerminalGrid() {
  return (
    <div className="flex-1 p-4 grid grid-cols-2 gap-4 overflow-hidden">
      {/* Terminal Panel 1 */}
      <div className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="flex items-center gap-2">
            <TerminalIcon size={14} className="text-[var(--color-accent)]" />
            <span className="font-mono text-xs font-medium">agent-a1b2</span>
            <span className="text-xs text-[var(--color-text-muted)]">| Implement Kanban UI</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <button className="hover:text-[var(--color-text-primary)]"><Minus size={14} /></button>
            <button className="hover:text-[var(--color-text-primary)]"><Maximize2 size={14} /></button>
            <button className="hover:text-[var(--color-text-primary)]"><X size={14} /></button>
          </div>
        </div>
        <div className="flex-1 p-3 font-mono text-xs overflow-y-auto">
          <div className="text-green-400">$ foreman run task-123</div>
          <div className="text-[var(--color-text-muted)]">Initializing agent environment...</div>
          <div className="text-[var(--color-text-muted)]">Loading context from knowledge graph...</div>
          <div className="text-blue-400">Context loaded: 3 files</div>
          <div className="mt-2">Analyzing requirements for Kanban UI...</div>
          <div>Creating components/KanbanBoard.tsx...</div>
          <div className="text-[var(--color-accent)] animate-pulse mt-2">_</div>
        </div>
      </div>

      {/* Terminal Panel 2 */}
      <div className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="flex items-center gap-2">
            <TerminalIcon size={14} className="text-[var(--color-accent)]" />
            <span className="font-mono text-xs font-medium">agent-x9y8</span>
            <span className="text-xs text-[var(--color-text-muted)]">| Review PR #42</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <button className="hover:text-[var(--color-text-primary)]"><Minus size={14} /></button>
            <button className="hover:text-[var(--color-text-primary)]"><Maximize2 size={14} /></button>
            <button className="hover:text-[var(--color-text-primary)]"><X size={14} /></button>
          </div>
        </div>
        <div className="flex-1 p-3 font-mono text-xs overflow-y-auto">
          <div className="text-green-400">$ foreman review pr-42</div>
          <div className="text-[var(--color-text-muted)]">Fetching PR details...</div>
          <div className="text-[var(--color-text-muted)]">Analyzing diff...</div>
          <div className="mt-2 text-yellow-400">Warning: Potential security issue in auth.ts</div>
          <div>Running static analysis...</div>
          <div className="text-[var(--color-accent)] animate-pulse mt-2">_</div>
        </div>
      </div>
    </div>
  );
}
