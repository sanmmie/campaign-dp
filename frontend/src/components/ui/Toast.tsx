import React, { ReactNode, useEffect } from 'react';
import { useToastStore } from '../../store';

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { toasts, removeToast } = useToastStore();

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </>
  );
}

interface ToastItemProps {
  toast: { id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' };
  onClose: () => void;
}

function Toast({ toast, onClose }: ToastItemProps) {
  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`${bgColors[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in`}
    >
      <span className="flex-1">{toast.message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white">
        ✕
      </button>
    </div>
  );
}