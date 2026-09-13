import React from 'react';

interface AtoPlayBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

export const AtoPlayBadge: React.FC<AtoPlayBadgeProps> = ({ 
  size = 'sm', 
  className = '',
  showText = true 
}) => {
  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5 gap-1',
    md: 'text-[10px] px-2 py-0.5 gap-1.5',
    lg: 'text-xs px-2.5 py-1 gap-1.5'
  };

  const imgSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div 
      className={`inline-flex items-center rounded-md bg-black/85 backdrop-blur-xs border border-white/25 text-white font-black tracking-tight shadow-md select-none pointer-events-none z-10 ${sizeClasses[size]} ${className}`}
      title="AtoPlay Verified Video"
    >
      <img 
        src="/icon.png" 
        alt="AtoPlay Logo" 
        className={`${imgSizes[size]} object-contain rounded-xs shrink-0`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/favicon.png';
        }}
      />
      {showText && <span>AtoPlay</span>}
    </div>
  );
};
