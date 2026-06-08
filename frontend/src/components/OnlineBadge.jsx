import { useOnline } from '../hooks/useOnline.js';

// Small connectivity pill: green "متصل" when online, red "غير متصل" when offline.
export default function OnlineBadge({ className = '' }) {
  const online = useOnline();
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full ${
        online ? 'bg-green-50 text-green-700' : 'bg-red-50 text-flag-red'
      } ${className}`}
      title={online ? 'متصل بالإنترنت' : 'غير متصل — وضع عدم الاتصال'}
    >
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-flag-red'}`} />
      {online ? 'متصل' : 'غير متصل'}
    </span>
  );
}
