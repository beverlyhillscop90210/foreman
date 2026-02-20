import { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { BottomBar } from './BottomBar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="w-screen h-screen flex flex-col bg-foreman-bg-deep overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
      <BottomBar />
    </div>
  );
};

