import React from 'react';

interface GatewayLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'custom';
}

export const GatewayLogo: React.FC<GatewayLogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClass = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    custom: '',
  }[size];

  return (
    <div
      className={`relative rounded-xl overflow-hidden shadow-md shadow-hkbu-blue-900/30 flex items-center justify-center shrink-0 ${sizeClass} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #001f4d 0%, #002b66 60%, #034085 100%)',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full p-1"
      >
        <defs>
          <linearGradient id="gwGoldGrad" x1="25" y1="18" x2="75" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#e5a823" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
          <linearGradient id="gwCyanGrad" x1="30" y1="26" x2="70" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="60%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <radialGradient id="gwCoreGlow" cx="50" cy="52" r="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.75" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#002b66" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Neural Glow Behind Portal */}
        <circle cx="50" cy="52" r="22" fill="url(#gwCoreGlow)" />

        {/* Outer Gateway Portal Arch (Gold) */}
        <path
          d="M26 80 V44 C26 30 37 18 50 18 C63 18 74 30 74 44 V80"
          stroke="url(#gwGoldGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Inner Gateway Portal Arch (Cyan) */}
        <path
          d="M34 80 V46 C34 37 41 28 50 28 C59 28 66 37 66 46 V80"
          stroke="url(#gwCyanGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Orbital Resonance Ring */}
        <circle
          cx="50"
          cy="52"
          r="12.5"
          stroke="url(#gwGoldGrad)"
          strokeWidth="1.6"
          strokeDasharray="3.5 2"
        />

        {/* 4-Pointed AI Intelligence Spark */}
        <path
          d="M50 37 Q50 52 35 52 Q50 52 50 67 Q50 52 65 52 Q50 52 50 37 Z"
          fill="#ffffff"
        />
        <path
          d="M50 41 Q50 52 39 52 Q50 52 50 63 Q50 52 61 52 Q50 52 50 41 Z"
          fill="#38bdf8"
        />
        <circle cx="50" cy="52" r="2.2" fill="#ffffff" />
      </svg>
    </div>
  );
};
