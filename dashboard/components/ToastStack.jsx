"use client";

export default function ToastStack({ toasts, onClose, closeAriaLabel = "Close notification" }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const tone = toast?.tone || "info";
        return (
          <div key={toast.id} className={`toast-item toast-${tone}`} role="status">
            <div className="toast-content">
              {toast.title ? <strong className="toast-title">{toast.title}</strong> : null}
              <span className="toast-message">{toast.message}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => onClose?.(toast.id)}
              aria-label={closeAriaLabel}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
