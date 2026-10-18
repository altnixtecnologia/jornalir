export function NotificationBellIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 5.2A3.5 3.5 0 0 1 14.7 4" opacity="0.55" />
      <path d="M6.2 10.2C6.2 6.8 8.7 4.3 12 4.3s5.8 2.5 5.8 5.9c0 3.6.9 5 2 6.3H4.2c1.1-1.3 2-2.7 2-6.3Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
