import { KnowledgeDocument, DocumentSourceType } from '../../types';

interface DocumentListProps {
  documents: KnowledgeDocument[];
  onSelectDocument: (doc: KnowledgeDocument) => void;
}

const getSourceIcon = (type: DocumentSourceType) => {
  const icons: Record<DocumentSourceType, string> = {
    web: '🌐',
    pdf: '📄',
    md: '📝',
    repo: '📦',
    image: '🖼️',
  };
  return icons[type];
};

const getTagColor = (tag: string) => {
  const colors: Record<string, string> = {
    'specs': '#3B82F6',
    'research': '#8B5CF6',
    'security': '#EF4444',
    'architecture': '#10B981',
    'regulations': '#F59E0B',
    'ml': '#EC4899',
    'drone': '#06B6D4',
    'internal': '#6366F1',
  };
  return colors[tag.toLowerCase()] || '#666666';
};

export const DocumentList = ({ documents, onSelectDocument }: DocumentListProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => onSelectDocument(doc)}
            className="bg-foreman-bg-medium border border-foreman-border p-4 hover:border-foreman-orange transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-2xl">{getSourceIcon(doc.sourceType)}</span>
                <div className="flex-1">
                  <h3 className="font-sans text-sm text-foreman-text mb-1">{doc.title}</h3>
                  <div className="font-mono text-xs text-foreman-text opacity-50 mb-2">
                    {doc.sourceUrl}
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xs text-foreman-text opacity-50">
                      {doc.dateAdded}
                    </span>
                    <span className="font-mono text-xs text-foreman-text opacity-50">
                      {doc.size}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {doc.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="font-mono text-xs px-2 py-0.5"
                        style={{ 
                          backgroundColor: getTagColor(tag) + '20', 
                          color: getTagColor(tag) 
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="font-sans text-xs text-foreman-text opacity-70">
                    {doc.preview}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

