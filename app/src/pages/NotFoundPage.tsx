// ============================================================
// 404 — Unknown Route (rendered inside the protected layout)
// ============================================================

import { Link } from 'react-router-dom';
import { Hexagon } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded">
          <Hexagon className="w-12 h-12 text-amber" strokeWidth={1.2} />
        </div>
        <div>
          <div className="text-primary font-bold tracking-tight" style={{ fontSize: '28px' }}>
            404
          </div>
          <p className="text-secondary text-sm mt-1">Page not found</p>
        </div>
        <Link
          to="/dashboard"
          className="px-4 py-2 rounded text-xs font-semibold transition-all hover:brightness-110"
          style={{ backgroundColor: '#D97706', color: '#111113' }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}