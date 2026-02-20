import { AgentView } from '../components/terminal/AgentView';
import { Sidebar } from '../components/layout/Sidebar';

export const DashboardPage = () => {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <AgentView />
      </div>
    </div>
  );
};

