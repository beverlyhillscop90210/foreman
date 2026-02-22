import { useState } from 'react';
import { useDagStore } from '../../stores/dagStore';

export function PlannerDialog({ onClose }: { onClose: () => void }) {
  const [project, setProject] = useState('');
  const [brief, setBrief] = useState('');
  const [planning, setPlanning] = useState(false);
  const planDag = useDagStore(s => s.planDag);

  const handleSubmit = async () => {
    if (!project.trim() || !brief.trim()) return;
    setPlanning(true);
    await planDag(project.trim(), brief.trim());
    setPlanning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1117] border border-[#30363d] rounded-lg w-[560px] max-h-[80vh] overflow-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="font-mono text-sm text-[#f0883e] font-bold">🧠 Plan New DAG</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block font-mono text-xs text-[#8b949e] mb-1">Project</label>
            <input
              value={project}
              onChange={e => setProject(e.target.value)}
              placeholder="e.g. zeon-api"
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#c9d1d9] font-mono focus:border-[#f0883e] outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-[#8b949e] mb-1">Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder="Describe what needs to be built..."
              rows={6}
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#c9d1d9] font-mono focus:border-[#f0883e] outline-none resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={planning || !project.trim() || !brief.trim()}
            className="w-full bg-[#f0883e] text-black font-mono text-sm font-bold py-2 rounded hover:bg-[#f0883e]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {planning ? '🧠 Planning…' : 'Generate DAG'}
          </button>
        </div>
      </div>
    </div>
  );
}
