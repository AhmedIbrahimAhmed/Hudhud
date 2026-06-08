import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Imperative confirm dialog to replace native window.confirm().
//
// Usage:
//   const confirm = useConfirm();
//   if (!(await confirm({ message: '...', confirmText: 'حذف', danger: true }))) return;
//
// A bare string also works: await confirm('متأكد؟')

const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, title, confirmText, cancelText, danger }
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    const config = typeof opts === 'string' ? { message: opts } : opts || {};
    setState({
      title: config.title || 'تأكيد',
      message: config.message || '',
      confirmText: config.confirmText || 'تأكيد',
      cancelText: config.cancelText || 'إلغاء',
      danger: config.danger ?? true,
    });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function close(result) {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => close(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-800">{state.title}</h3>
            {state.message && <p className="text-sm text-gray-600">{state.message}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => close(false)}
                className="text-sm px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                {state.cancelText}
              </button>
              <button
                onClick={() => close(true)}
                className={`text-sm px-4 py-2 rounded-xl text-white ${
                  state.danger ? 'bg-flag-red hover:opacity-90' : 'bg-brand hover:bg-brand-dark'
                }`}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
