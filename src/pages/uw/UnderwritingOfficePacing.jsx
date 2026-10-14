import React from 'react';

// Temporary placeholder for Office Pacing while its workflow is redesigned.
// The previous implementation can be restored without changing routes.
export default function UnderwritingOfficePacing() {
  return (
    <main className="min-h-[75vh] bg-[#f4f6f8] px-5 py-10 flex items-center justify-center">
      <style>{`
        @keyframes uwPacingFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes uwPacingSweep { 0%,100% { transform: rotate(-23deg) } 50% { transform: rotate(23deg) } }
        @keyframes uwPacingPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .uw-pacing-float, .uw-pacing-sweep, .uw-pacing-pulse { animation: none !important; }
        }
      `}</style>
      <section className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white shadow-xl overflow-hidden text-center">
        <div className="bg-gradient-to-r from-[#17191d] to-[#30343b] px-8 py-7 text-left">
          <div className="text-[11px] font-extrabold tracking-[.2em] text-amber-300">UW OPERATIONS</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Office Pacing</h1>
        </div>
        <div className="px-6 py-12 sm:px-12">
          <div className="uw-pacing-float mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-amber-50 border border-amber-100" style={{ animation: 'uwPacingFloat 3s ease-in-out infinite' }} aria-hidden="true">
            <svg viewBox="0 0 120 120" className="h-24 w-24" fill="none">
              <rect x="19" y="70" width="82" height="12" rx="3" fill="#F59E0B" />
              <path d="M30 70L40 43H80L90 70" fill="#FDE68A" stroke="#B45309" strokeWidth="3" strokeLinejoin="round" />
              <path d="M44 43V30C44 20 51 14 60 14C69 14 76 20 76 30V43" stroke="#B45309" strokeWidth="4" />
              <path d="M37 56H83" stroke="#D97706" strokeWidth="4" strokeDasharray="9 6" />
              <g className="uw-pacing-sweep" style={{ transformOrigin: '60px 52px', animation: 'uwPacingSweep 2.5s ease-in-out infinite' }}>
                <path d="M58 50L78 30" stroke="#374151" strokeWidth="7" strokeLinecap="round" />
                <rect x="74" y="19" width="15" height="19" rx="3" transform="rotate(45 74 19)" fill="#64748B" />
              </g>
              <circle cx="22" cy="35" r="4" fill="#F59E0B" className="uw-pacing-pulse" style={{ animation: 'uwPacingPulse 2s infinite' }} />
              <circle cx="100" cy="48" r="3" fill="#F59E0B" className="uw-pacing-pulse" style={{ animation: 'uwPacingPulse 2s .6s infinite' }} />
            </svg>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-800">
            <span className="uw-pacing-pulse h-2 w-2 rounded-full bg-amber-500" style={{ animation: 'uwPacingPulse 1.5s infinite' }} />
            Under Construction
          </span>
          <h2 className="mt-5 text-2xl font-bold text-gray-900">We're improving Office Pacing</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-gray-600">
            This section is temporarily unavailable while we redesign the workflow to make reporting and office performance tracking easier to use.
          </p>
          <p className="mt-7 text-xs text-gray-400">Please check back later.</p>
        </div>
      </section>
    </main>
  );
}
