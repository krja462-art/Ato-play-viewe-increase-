import React, { useId } from 'react';

interface RealCoinProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

const SIZE_MAP: Record<NonNullable<RealCoinProps['size']>, number> = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
};

/**
 * Realistic 3D Metallic 24K Gold Coin Component
 * Crafted with multi-stop metallic gold gradients, 3D bottom rim depth,
 * minted edge ridges, recessed inner face, embossed 3D star emblem, and specular shine.
 */
export const RealCoin: React.FC<RealCoinProps> = ({
  size = 'sm',
  className = '',
  animate = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const px = SIZE_MAP[size] || 18;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none relative ${
        animate ? 'animate-bounce' : ''
      } ${className}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_2px_3px_rgba(146,64,14,0.38)]"
      >
        <defs>
          {/* 3D Bottom Edge Extrusion Gradient */}
          <linearGradient id={`edge_${uid}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="35%" stopColor="#92400E" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* Outer Beveled 24K Gold Rim */}
          <linearGradient id={`rim_${uid}`} x1="8" y1="4" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="18%" stopColor="#FDE047" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="78%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>

          {/* Recessed Inner Gold Dish */}
          <radialGradient id={`dish_${uid}`} cx="38%" cy="32%" r="65%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="82%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#92400E" />
          </radialGradient>

          {/* Inner Raised Gold Plate */}
          <linearGradient id={`plate_${uid}`} x1="16" y1="14" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Embossed Center Star Emblem Gradient */}
          <linearGradient id={`star_${uid}`} x1="20" y1="16" x2="44" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="25%" stopColor="#FEF08A" />
            <stop offset="65%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>

          {/* Diagonal Specular Sheen */}
          <linearGradient id={`shine_${uid}`} x1="12" y1="8" x2="42" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.72" />
            <stop offset="45%" stopColor="#FEF9C3" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. 3D Coin Cylinder Base / Bottom Thickness */}
        <ellipse cx="32" cy="34.5" rx="28" ry="27.5" fill={`url(#edge_${uid})`} />

        {/* 2. Main Coin Face (Slightly tilted for 3D depth) */}
        <ellipse cx="32" cy="30.5" rx="28" ry="27.5" fill={`url(#rim_${uid})`} />

        {/* 3. Outer Metallic Specular Ring Highlight */}
        <ellipse
          cx="32"
          cy="30.5"
          rx="27"
          ry="26.5"
          stroke="#FEF9C3"
          strokeOpacity="0.75"
          strokeWidth="1.2"
        />

        {/* 4. Recessed Inner Coin Core */}
        <ellipse cx="32" cy="30.5" rx="22.5" ry="22" fill={`url(#dish_${uid})`} />

        {/* 5. Inner Bevel Shadow & Highlight Ring */}
        <ellipse
          cx="32"
          cy="30.5"
          rx="22.5"
          ry="22"
          stroke="#78350F"
          strokeOpacity="0.45"
          strokeWidth="1.4"
        />
        <ellipse
          cx="32"
          cy="31"
          rx="21.2"
          ry="20.7"
          stroke="#FEF08A"
          strokeOpacity="0.6"
          strokeWidth="0.9"
        />

        {/* 6. Minted Coin Ridge Dots Around Inner Perimeter */}
        <ellipse
          cx="32"
          cy="30.5"
          rx="19.5"
          ry="19"
          stroke="#FDE047"
          strokeOpacity="0.65"
          strokeWidth="1.3"
          strokeDasharray="2.2 3.1"
        />

        {/* 7. Inner Raised Medallion Plate */}
        <ellipse cx="32" cy="30.5" rx="16.8" ry="16.3" fill={`url(#plate_${uid})`} />

        {/* 8. Embossed 3D Star / Currency Emblem Drop Shadow */}
        <path
          d="M32 18.2L35.4 25.3L43.2 26.3L37.5 31.7L38.9 39.4L32 35.7L25.1 39.4L26.5 31.7L20.8 26.3L28.6 25.3L32 18.2Z"
          fill="#78350F"
          fillOpacity="0.45"
          transform="translate(0, 1.6)"
        />

        {/* 9. Embossed 3D Gold Star Emblem */}
        <path
          d="M32 18.2L35.4 25.3L43.2 26.3L37.5 31.7L38.9 39.4L32 35.7L25.1 39.4L26.5 31.7L20.8 26.3L28.6 25.3L32 18.2Z"
          fill={`url(#star_${uid})`}
          stroke="#FEF9C3"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* 10. Center Gem Facet Highlight inside Star */}
        <circle cx="32" cy="29.5" r="2.6" fill="#FEF9C3" fillOpacity="0.85" />

        {/* 11. Specular Gloss Light Sweep Across Top-Left */}
        <path
          d="M11 22C14.5 11.5 24.5 5 35.5 5.5C41.5 5.8 46.8 8.2 50.8 12.2C38.5 13.5 23.5 22.5 14.5 36.5C11.2 32.2 9.8 26.8 11 22Z"
          fill={`url(#shine_${uid})`}
        />
      </svg>
    </span>
  );
};
