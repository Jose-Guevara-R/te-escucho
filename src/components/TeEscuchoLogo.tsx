import React, { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface TeEscuchoLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export const TeEscuchoLogo: React.FC<TeEscuchoLogoProps> = ({
  size = 112,
  animated = true,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  const shieldGradId = `te-shield-${uid}`;
  const rimGradId = `te-rim-${uid}`;
  const waveGradId = `te-wave-${uid}`;
  const coreGlowId = `te-core-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Logo oficial de Te Escucho"
    >
      <defs>
        <linearGradient id={shieldGradId} x1="18" y1="10" x2="102" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="48%" stopColor="#0F766E" />
          <stop offset="100%" stopColor="#0B3B3A" />
        </linearGradient>

        <linearGradient id={rimGradId} x1="20" y1="12" x2="100" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#99F6E4" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0.7" />
        </linearGradient>

        <linearGradient id={waveGradId} x1="30" y1="28" x2="92" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0F2FE" />
          <stop offset="55%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#5EEAD4" />
        </linearGradient>

        <radialGradient id={coreGlowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(60 66) rotate(90) scale(24)">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FDE68A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer Protective Sanctuary Shield (Zero-PII Privacy & School Safety) */}
      <motion.path
        d="M60 8L102 23.5V54.5C102 80.5 84.4 101.6 60 111.5C35.6 101.6 18 80.5 18 54.5V23.5L60 8Z"
        fill={`url(#${shieldGradId})`}
        initial={shouldAnimate ? { opacity: 0, scale: 0.88 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: '60px 60px' }}
      />

      {/* Luminous Perimeter Stroke */}
      <motion.path
        d="M60 8L102 23.5V54.5C102 80.5 84.4 101.6 60 111.5C35.6 101.6 18 80.5 18 54.5V23.5L60 8Z"
        stroke={`url(#${rimGradId})`}
        strokeWidth="2.25"
        strokeLinejoin="round"
        initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Subtle Warm Ambient Core behind the Heart */}
      <circle cx="60" cy="66" r="24" fill={`url(#${coreGlowId})`} />

      {/* Inner Safe Dialogue Bubble / Ear Contour (Empathy + Real-Time Listening) */}
      <motion.path
        d="M39 51C39 38.8 48.5 29.5 60.5 29.5C72.5 29.5 81.5 38.6 81.5 50.3C81.5 60.5 75.5 66.2 71.2 70.8C68.3 73.9 67 76.8 66.5 79.5C65.9 82.8 63.3 85 59.9 85C56.7 85 54.2 82.8 53.6 79.7"
        stroke={`url(#${waveGradId})`}
        strokeWidth="4.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.85, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Secondary Acoustic Listening Wave */}
      <motion.path
        d="M47.5 52C47.5 44.5 53.3 38.8 60.5 38.8C67.7 38.8 73 44.2 73 51.1C73 56.3 69.5 59.8 66.8 62.6"
        stroke="#A7F3D0"
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={shouldAnimate ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 0.95 }}
        transition={{ duration: 0.65, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Protective Chat Tail Anchor */}
      <motion.path
        d="M38 69.5L32.5 79.5L43.5 76"
        stroke="#7DD3FC"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={shouldAnimate ? { opacity: 0, scale: 0.7 } : false}
        animate={{ opacity: 0.95, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: '38px 75px' }}
      />

      {/* Heart-Spark Core (Human Care & Hope) */}
      <motion.path
        d="M59.5 67.2C59.5 67.2 51.8 61.8 51.8 56.2C51.8 53.5 53.9 51.5 56.5 51.5C58 51.5 59.1 52.2 59.5 53.3C59.9 52.2 61 51.5 62.5 51.5C65.1 51.5 67.2 53.5 67.2 56.2C67.2 61.8 59.5 67.2 59.5 67.2Z"
        fill="#FDE68A"
        initial={shouldAnimate ? { opacity: 0, scale: 0.4 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: '59.5px 59px' }}
      />
    </svg>
  );
};
