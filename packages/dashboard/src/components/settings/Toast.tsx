// Toast store
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (message, type) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type };
    
    set((state) => ({
      toasts: [...state.toasts, toast]
    }));
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }));
    }, 3000);
  },
  
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),
}));

const ToastItem = ({ toast }: { toast: Toast }) => {
  const removeToast = useToastStore(state => state.removeToast);
  
  const bgColor = toast.type === 'success' ? 'bg-green-600' :
                  toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  
  return (
    <div
      className={`${bgColor} border border-foreman-border text-white px-4 py-3 mb-2 
                  flex items-center justify-between min-w-[300px] max-w-[400px]`}
    >
      <span className="font-sans text-sm">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-4 text-white hover:text-gray-300 font-bold"
      >
        ×
      </button>
    </div>
  );
};

export const ToastContainer = () => {
  const toasts = useToastStore(state => state.toasts);
  
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

// Helper hook for easy toast usage
export const useToast = () => {
  const addToast = useToastStore(state => state.addToast);
  
  return {
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    info: (message: string) => addToast(message, 'info'),
  };
};

