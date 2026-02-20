import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatStore {
  messagesByUser: Record<string, ChatMessage[]>;
  currentUserEmail: string | null;
  isOpen: boolean;
  isLoading: boolean;
  setCurrentUser: (email: string | null) => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  toggleChat: () => void;
  setLoading: (loading: boolean) => void;
  getMessages: () => ChatMessage[];
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messagesByUser: {},
      currentUserEmail: null,
      isOpen: false,
      isLoading: false,
      
      setCurrentUser: (email) => set({ currentUserEmail: email }),
      
      addMessage: (role, content) => {
        const { currentUserEmail, messagesByUser } = get();
        if (!currentUserEmail) return;
        
        const newMessage: ChatMessage = {
          id: `${Date.now()}-${Math.random()}`,
          role,
          content,
          timestamp: new Date(),
        };
        
        const userMessages = messagesByUser[currentUserEmail] || [];
        
        set({
          messagesByUser: {
            ...messagesByUser,
            [currentUserEmail]: [...userMessages, newMessage],
          },
        });
      },
      
      toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      getMessages: () => {
        const { currentUserEmail, messagesByUser } = get();
        if (!currentUserEmail) return [];
        return messagesByUser[currentUserEmail] || [];
      },
    }),
    {
      name: 'foreman-chat-storage',
      partialize: (state) => ({ messagesByUser: state.messagesByUser }),
    }
  )
);

