import { useState, useRef, useEffect, useCallback } from "react";
import { ChatPanel } from "../components/chat/ChatPanel";

interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  content: string;
  source_type: string;
  source_url?: string;
  source_task_id?: string;
  tags: string[];
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

const API_URL = import.meta.env.VITE_BRIDGE_URL || "https://foreman.beverlyhillscop.io";
const API_TOKEN = import.meta.env.VITE_BRIDGE_TOKEN || "1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3";

const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(API_URL + path, {
    ...opts,
    headers: { Authorization: "Bearer " + API_TOKEN, "Content-Type": "application/json", ...opts?.headers },
  });

async function fetchKnowledge(search?: string, category?: string): Promise<KnowledgeDocument[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category && category !== "All") params.set("category", category);
  const res = await apiFetch("/knowledge" + (params.toString() ? "?" + params : ""));
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

async function deleteKnowledgeDoc(id: string): Promise<boolean> {
  const res = await apiFetch("/knowledge/" + id, { method: "DELETE" });
  return res.ok;
}

async function updateKnowledgeDoc(id: string, updates: Partial<KnowledgeDocument>): Promise<boolean> {
  const res = await apiFetch("/knowledge/" + id, { method: "PUT", body: JSON.stringify(updates) });
  return res.ok;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// --- Detail Modal ---
const DocDetailModal = ({
  doc,
  onClose,
  onDelete,
  onUpdate,
}: {
  doc: KnowledgeDocument;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<KnowledgeDocument>) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editContent, setEditContent] = useState(doc.content);
  const [editCategory, setEditCategory] = useState(doc.category);
  const [editTags, setEditTags] = useState(doc.tags.join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    onUpdate(doc.id, {
      title: editTitle,
      content: editContent,
      category: editCategory,
      tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-[#111111] border border-[#333] w-[90vw] max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] flex-shrink-0">
          {isEditing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-[#444] text-[#e0e0e0] font-sans text-sm px-2 py-1 mr-2 focus:outline-none focus:border-[#FF6B2B]"
            />
          ) : (
            <h2 className="font-sans text-sm text-[#e0e0e0] font-medium truncate flex-1">{doc.title}</h2>
          )}
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-2 py-1 font-mono text-[11px] text-[#999] hover:text-[#FF6B2B] border border-[#333] hover:border-[#FF6B2B] transition-colors"
              >
                Edit
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleSave}
                  className="px-2 py-1 font-mono text-[11px] text-[#111] bg-[#FF6B2B] hover:bg-[#ff8c57] transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 font-mono text-[11px] text-[#999] hover:text-white border border-[#333] transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-2 py-1 font-mono text-[11px] text-[#999] hover:text-red-500 border border-[#333] hover:border-red-500 transition-colors"
              >
                Delete
              </button>
            ) : (
              <button
                onClick={() => onDelete(doc.id)}
                className="px-2 py-1 font-mono text-[11px] text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                Confirm Delete
              </button>
            )}
            <button onClick={onClose} className="text-[#999] hover:text-white ml-1 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-[#333] flex-shrink-0">
          {isEditing ? (
            <>
              <input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="Category"
                className="bg-[#0a0a0a] border border-[#444] text-[#e0e0e0] font-mono text-[11px] px-2 py-1 w-32 focus:outline-none focus:border-[#FF6B2B]"
              />
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="Tags (comma separated)"
                className="bg-[#0a0a0a] border border-[#444] text-[#e0e0e0] font-mono text-[11px] px-2 py-1 flex-1 focus:outline-none focus:border-[#FF6B2B]"
              />
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] text-[#FF6B2B]">{doc.category}</span>
              <span className="font-mono text-[11px] text-[#666]">{doc.source_type}</span>
              <span className="font-mono text-[11px] text-[#666]">{formatDate(doc.updated_at)}</span>
              <span className="font-mono text-[11px] text-[#666]">{formatSize(doc.size_bytes)}</span>
              {doc.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-[#1a1a1a] text-[#FF6B2B] font-mono text-[10px] border border-[#333]">{tag}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full min-h-[300px] bg-[#0a0a0a] border border-[#444] text-[#e0e0e0] font-mono text-xs p-3 resize-none focus:outline-none focus:border-[#FF6B2B]"
            />
          ) : (
            <pre className="font-mono text-xs text-[#ccc] whitespace-pre-wrap leading-relaxed">{doc.content}</pre>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main Page ---
export const KnowledgePage = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [activeTab, setActiveTab] = useState<"categories" | "smartass">("categories");
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocs = useCallback(async () => {
    setIsLoading(true);
    const docs = await fetchKnowledge(searchQuery || undefined, selectedCategory);
    setDocuments(docs);
    const cats = Array.from(new Set(docs.map((d) => d.category))).sort();
    setCategories(cats);
    setIsLoading(false);
  }, [searchQuery, selectedCategory]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = async (id: string) => {
    const ok = await deleteKnowledgeDoc(id);
    if (ok) {
      setSelectedDoc(null);
      loadDocs();
    }
  };

  const handleUpdate = async (id: string, updates: Partial<KnowledgeDocument>) => {
    const ok = await updateKnowledgeDoc(id, updates);
    if (ok) loadDocs();
  };

  // Sidebar resize
  const handleResizeStart = useCallback(() => { setIsResizing(true); }, []);
  useEffect(() => {
    if (!isResizing) return;
    const move = (e: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(500, e.clientX)));
    const up = () => setIsResizing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [isResizing]);

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex flex-col" style={{ cursor: isResizing ? "col-resize" : undefined }}>
      <div className="flex-1 flex min-h-0">
      {/* Modal */}
      {selectedDoc && (
        <DocDetailModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} onDelete={handleDelete} onUpdate={handleUpdate} />
      )}

      {/* Sidebar */}
      <div ref={sidebarRef} className="bg-[#111111] border-r border-[#333] flex flex-col relative flex-shrink-0" style={{ width: sidebarWidth + "px" }}>
        <div className="flex border-b border-[#333]">
          <button onClick={() => setActiveTab("categories")} className={"flex-1 px-3 py-2 font-sans text-xs transition-colors " + (activeTab === "categories" ? "bg-[#FF6B2B] text-white" : "text-[#999] hover:bg-[#1a1a1a]")}>Categories</button>
          <button onClick={() => setActiveTab("smartass")} className={"flex-1 px-3 py-2 font-sans text-xs transition-colors " + (activeTab === "smartass" ? "bg-[#FF6B2B] text-white" : "text-[#999] hover:bg-[#1a1a1a]")}>Smartass</button>
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === "categories" ? (
            <div className="h-full overflow-y-auto">
              <button onClick={() => setSelectedCategory("All")} className={"w-full text-left px-3 py-2 font-sans text-xs border-b border-[#333] transition-colors " + (selectedCategory === "All" ? "bg-[#FF6B2B] text-white" : "text-[#999] hover:bg-[#1a1a1a]")}>All Documents</button>
              {categories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={"w-full text-left px-3 py-2 font-sans text-xs border-b border-[#333] transition-colors " + (selectedCategory === cat ? "bg-[#FF6B2B] text-white" : "text-[#999] hover:bg-[#1a1a1a]")}>{cat}</button>
              ))}
            </div>
          ) : (
            <ChatPanel />
          )}
        </div>
        <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#FF6B2B] transition-colors" onMouseDown={handleResizeStart} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 bg-[#0a0a0a] border-b border-[#333]">
          <input type="text" placeholder="Search documents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#111111] border border-[#333] text-[#e0e0e0] font-sans text-xs px-3 py-2 focus:outline-none focus:border-[#FF6B2B]" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><span className="font-mono text-xs text-[#666]">Loading...</span></div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#111111] border-b border-[#333] sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-sans text-[11px] text-[#999] uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-2 font-sans text-[11px] text-[#999] uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-2 font-sans text-[11px] text-[#999] uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-2 font-sans text-[11px] text-[#999] uppercase tracking-wide">Updated</th>
                  <th className="text-left px-4 py-2 font-sans text-[11px] text-[#999] uppercase tracking-wide">Size</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} onClick={() => setSelectedDoc(doc)} className="border-b border-[#333] hover:bg-[#1a1a1a] cursor-pointer transition-colors">
                    <td className="px-4 py-2 font-sans text-xs text-[#e0e0e0] truncate max-w-[300px]">{doc.title}</td>
                    <td className="px-4 py-2 font-sans text-xs text-[#999]">{doc.category}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[#999]">{doc.source_type}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[#999]">{formatDate(doc.updated_at)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[#999]">{formatSize(doc.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && documents.length === 0 && (
            <div className="flex items-center justify-center h-64"><p className="font-sans text-xs text-[#666]">No documents found</p></div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};
