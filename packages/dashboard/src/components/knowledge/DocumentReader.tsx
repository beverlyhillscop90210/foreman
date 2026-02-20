import { useEffect } from 'react';
import { KnowledgeDocument } from '../../types';

interface DocumentReaderProps {
  document: KnowledgeDocument;
  onClose: () => void;
}

export const DocumentReader = ({ document, onClose }: DocumentReaderProps) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#111] border border-[#333] max-w-[900px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-[#333] p-4 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="font-sans text-xl text-foreman-text mb-2">{document.title}</h2>
            <div className="font-mono text-xs text-foreman-text opacity-50">
              {document.sourceUrl}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-foreman-text hover:text-foreman-orange transition-colors text-2xl leading-none ml-4"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-foreman-bg-medium border border-foreman-border p-6">
            <pre className="font-sans text-sm text-foreman-text whitespace-pre-wrap leading-relaxed">
              {document.content || document.preview}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

