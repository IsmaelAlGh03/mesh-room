interface IconProps {
  className?: string;
}

interface DeviceIconProps extends IconProps {
  device: 'mic' | 'camera';
  on: boolean;
}

const BASE = 'h-5 w-5 shrink-0';

export function DeviceIcon({ device, on, className = BASE }: DeviceIconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      {device === 'mic' ? (
        <>
          <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
          <path d="M4.5 9v.5a5.5 5.5 0 0 0 11 0V9" />
          <path d="M10 15.5v2" />
        </>
      ) : (
        <>
          <rect x="2.5" y="5" width="10" height="10" />
          <path d="M12.5 9l5-3v8l-5-3" />
        </>
      )}
      {!on && <path d="M3 3L17 17" />}
    </svg>
  );
}

export function AttachIcon({ className = BASE }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <path d="M17.9 9.2l-7.7 7.7a5 5 0 0 1-7.1-7.1l7.7-7.7a3.3 3.3 0 0 1 4.7 4.7l-7.7 7.7a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1" />
    </svg>
  );
}

export function LeaveIcon({ className = BASE }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <path d="M10.5 3.5H4.5v13h6" />
      <path d="M8.5 10h8" />
      <path d="M13.5 7l3 3-3 3" />
    </svg>
  );
}
