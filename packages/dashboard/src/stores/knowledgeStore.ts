import { create } from 'zustand';
import { KnowledgeDocument } from '../types';

interface KnowledgeStore {
  selectedCategory: string;
  selectedDocument: KnowledgeDocument | null;
  searchQuery: string;
  setSelectedCategory: (category: string) => void;
  setSelectedDocument: (doc: KnowledgeDocument | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useKnowledgeStore = create<KnowledgeStore>((set) => ({
  selectedCategory: 'All Documents',
  selectedDocument: null,
  searchQuery: '',
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedDocument: (doc) => set({ selectedDocument: doc }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

