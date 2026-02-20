import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatStore {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  toggleChat: () => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isOpen: false,
  isLoading: false,
  
  addMessage: (role, content) => {
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
    };
    set((state) => ({
      messages: [...state.messages, newMessage],
    }));
  },
  
  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
  
  setLoading: (loading) => set({ isLoading: loading }),
}));

