import { CheckCircle2, AlertCircle } from "lucide-react";

export default function Toast({ toasts }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}