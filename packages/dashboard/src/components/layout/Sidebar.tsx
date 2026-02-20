import { useState, useMemo } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { agents, selectedProject, setSelectedProject } = useTerminalStore();

  // Group agents by project (bucket)
  const projects = useMemo(() => {
    const projectMap = new Map<string, { name: string; activeCount: number; totalCount: number }>();

    agents.forEach(agent => {
      const existing = projectMap.get(agent.bucket);
      const isActive = agent.status === 'running';

      if (existing) {
        existing.totalCount++;
        if (isActive) existing.activeCount++;
      } else {
        projectMap.set(agent.bucket, {
          name: agent.bucket,
          activeCount: isActive ? 1 : 0,
          totalCount: 1,
        });
      }
    });

    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  if (isCollapsed) {
    return (
      <div className="w-12 bg-foreman-bg-dark border-r border-foreman-border flex flex-col">
        <button
          onClick={() => setIsCollapsed(false)}
          className="h-12 flex items-center justify-center text-foreman-text hover:bg-foreman-bg-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[220px] bg-foreman-bg-dark border-r border-foreman-border flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-foreman-border flex items-center justify-end px-3">
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-foreman-text hover:text-foreman-orange"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Project List */}
        {projects.map((project) => (
          <button
            key={project.name}
            onClick={() => setSelectedProject(project.name)}
            className={`w-full px-3 py-3 text-left border-b border-foreman-border hover:bg-foreman-bg-medium
                        ${selectedProject === project.name ? 'bg-foreman-bg-medium border-l-2 border-l-foreman-orange' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-xs text-foreman-text font-medium">{project.name}</span>
              <span className="font-mono text-xs text-foreman-text opacity-70">
                {project.totalCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${project.activeCount > 0 ? 'bg-foreman-orange' : 'bg-gray-500'}`} />
              <span className="font-mono text-[11px] text-foreman-text opacity-50">
                {project.activeCount} active
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

