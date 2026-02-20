import { TerminalGrid } from '../components/terminal/TerminalGrid';
import { Sidebar } from '../components/layout/Sidebar';

export const DashboardPage = () => {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        <TerminalGrid />
      </div>
    </div>
  );
};

