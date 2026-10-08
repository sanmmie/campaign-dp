import { useToastStore } from '../store';

export function useToast() {
  return {
    addToast: useToastStore((state) => state.addToast),
    removeToast: useToastStore((state) => state.removeToast),
    toasts: useToastStore((state) => state.toasts),
  };
}