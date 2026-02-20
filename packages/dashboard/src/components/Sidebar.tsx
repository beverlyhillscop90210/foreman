import { Activity, Terminal, LayoutDashboard, Database, Settings } from "lucide-react";

export function Sidebar() {
  return (
    <div className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      <div className="p-4 border-b border-[var(--color-border)]">
        <h1 className="text-xl font-bold text-[var(--color-accent)] font-mono tracking-wider">FOREMAN</h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">Views</h2>
          <nav className="space-y-2">
            <a href="#" className="flex items-center gap-3 text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-2 rounded-md">
              <Terminal size={18} />
              <span className="font-medium">Mission Control</span>
            </a>
            <a href="#" className="flex items-center gap-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-2 rounded-md transition-colors">
              <LayoutDashboard size={18} />
              <span className="font-medium">Kanban Board</span>
            </a>
            <a href="#" className="flex items-center gap-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-2 rounded-md transition-colors">
              <Database size={18} />
              <span className="font-medium">Knowledge Base</span>
            </a>
            <a href="#" className="flex items-center gap-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-2 rounded-md transition-colors">
              <Settings size={18} />
              <span className="font-medium">Configuration</span>
            </a>
          </nav>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Active Agents</h2>
            <span className="bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs px-2 py-0.5 rounded-full font-mono">2</span>
          </div>
          <div className="space-y-3">
            {/* Mock Agent 1 */}
            <div className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-background)]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-[var(--color-text-primary)]">agent-a1b2</span>
                <span className="flex h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
              </div>
              <div className="text-sm text-[var(--color-text-muted)] truncate">Implement Kanban UI</div>
              <div className="mt-2 text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                <Activity size={12} />
                <span>Running (12m)</span>
              </div>
            </div>
            
            {/* Mock Agent 2 */}
            <div className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-background)]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-[var(--color-text-primary)]">agent-x9y8</span>
                <span className="flex h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
              </div>
              <div className="text-sm text-[var(--color-text-muted)] truncate">Review PR #42</div>
              <div className="mt-2 text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                <Activity size={12} />
                <span>Running (3m)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
