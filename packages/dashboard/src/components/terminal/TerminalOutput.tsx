import { useEffect, useRef } from 'react';
import { TerminalLine, AgentStatus } from '../../types';

interface TerminalOutputProps {
  lines: TerminalLine[];
  status?: AgentStatus;
}

export const TerminalOutput = ({ lines, status }: TerminalOutputProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const getSyntaxHighlightedText = (text: string) => {
    // Check for special prefixes and apply colors
    if (text.startsWith('[INFO]')) {
      return <span className="text-white">{text}</span>;
    }
    if (text.startsWith('[SUCCESS]')) {
      return <span className="text-[#4ade80]">{text}</span>;
    }
    if (text.startsWith('[ERROR]')) {
      return <span className="text-[#f87171]">{text}</span>;
    }
    if (text.startsWith('[PROGRESS]')) {
      return <span className="text-[#FF6B2B]">{text}</span>;
    }
    if (text.startsWith('[DEBUG]')) {
      return <span className="text-[#666]">{text}</span>;
    }
    if (text.startsWith('✅')) {
      return <span className="text-[#4ade80]">{text}</span>;
    }
    if (text.startsWith('❌')) {
      return <span className="text-[#f87171]">{text}</span>;
    }

    // Try to detect and pretty-print JSON
    if (text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        const pretty = JSON.stringify(parsed, null, 2);
        return <span className="text-green-400">{pretty}</span>;
      } catch {
        // Not valid JSON, fall through
      }
    }

    // Default color based on line type
    return <span className="text-green-400">{text}</span>;
  };

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400';
      case 'system':
        return 'text-foreman-orange';
      default:
        return '';
    }
  };

  return (
    <div className="h-full bg-foreman-bg-deep p-3 font-mono text-[11px]">
      {lines.map((line, index) => (
        <div key={line.id} className="flex gap-3">
          <span className="text-[#666] select-none min-w-[2.5rem] text-right">
            {String(index + 1).padStart(3, ' ')}
          </span>
          <div className={`${getLineColor(line.type)} whitespace-pre-wrap flex-1`}>
            {getSyntaxHighlightedText(line.text)}
          </div>
        </div>
      ))}
      {status === 'completed' && lines.length > 0 && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-foreman-border">
          <span className="text-[#666] select-none min-w-[2.5rem] text-right"></span>
          <div className="text-[#4ade80] flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#4ade80] bg-opacity-10 border border-[#4ade80] border-opacity-30">
              Review complete
            </span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};

