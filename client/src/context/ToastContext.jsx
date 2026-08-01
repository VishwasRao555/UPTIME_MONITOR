import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle size={18} weight="fill" />,
  error: <WarningCircle size={18} weight="fill" />,
  info: <Info size={18} weight="fill" />,
};

/** Lightweight, dependency-free toast system.
 *  Toasts announce via aria-live and auto-dismiss after 4s (never steal focus). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'success') => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const toast = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role="status">
            <span className="toast-icon">{ICONS[t.type]}</span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
