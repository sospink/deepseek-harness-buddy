import type { IconProps } from './icons/props.ts'

/**
 * Low-altitude safety Agent mark: a protected airspace shield crossed by a
 * flight path. The mark is intentionally self-contained so a deployment does
 * not depend on an external logo host or inherit the official provider mark.
 * @param props.size - mark width in px; height follows the 24px artwork ratio.
 * @param props.className - extra class name for the host surface.
 * @returns the decorative low-altitude safety mark.
 */
export function LowAltitudeSafetyLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.25 20 5.3v5.57c0 5.05-3.32 9.23-8 10.88-4.68-1.65-8-5.83-8-10.88V5.3l8-3.05Z"
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M5.15 13.8c2.17-2.82 4.82-4.33 7.96-4.53 2.06-.13 3.99.3 5.74 1.28"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="m13.2 7.7 2.12 2.7-3.32.15"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.05" cy="14.7" r="1.1" fill="currentColor" />
      <circle cx="18.15" cy="10.7" r="1.1" fill="currentColor" />
    </svg>
  )
}
