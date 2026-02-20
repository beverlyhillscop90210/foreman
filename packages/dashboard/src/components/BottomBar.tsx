import { GitBranch, Clock } from "lucide-react";

export function BottomBar() {
  return (
    <div className="h-8 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-4 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <GitBranch size={12} />
          <span>main</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono">8c34e13</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>Connected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={12} />
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
