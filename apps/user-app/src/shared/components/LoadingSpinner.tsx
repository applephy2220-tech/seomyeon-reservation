import React from 'react';

interface LoadingSpinnerProps {
  fullPage?: boolean;
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  fullPage = false, 
  message = '실시간 빈자리 확인 중...' 
}) => {
  const spinnerElement = (
    <div className="flex flex-col items-center justify-center p-6 space-y-4">
      {/* Neon Spinning Outer Ring */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-purple-500/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-purple-500 border-r-cyan-400 animate-spin shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
        {/* Blinking center pulse */}
        <div className="absolute inset-4 rounded-full bg-slate-900 border border-purple-500/40 animate-pulse flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
        </div>
      </div>
      
      {/* Premium Neon glow message */}
      {message && (
        <p className="text-sm font-semibold tracking-wider text-slate-400 animate-pulse text-center">
          {message}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
};

export default LoadingSpinner;
