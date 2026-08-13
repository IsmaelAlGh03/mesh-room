interface DeviceSelectProps {
  id: string;
  label: string;
  devices: MediaDeviceInfo[];
  value: string;
  disabled?: boolean;
  onChange: (deviceId: string) => void;
}

export function DeviceSelect({
  id,
  label,
  devices,
  value,
  disabled = false,
  onChange,
}: DeviceSelectProps): JSX.Element {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[10px] tracking-[0.08em] uppercase opacity-60"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled || devices.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-[1.5px] border-ink bg-substrate px-3 py-2.5 text-sm text-ink disabled:opacity-45"
      >
        {devices.length === 0 ? (
          <option value="">None found</option>
        ) : (
          devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label === '' ? 'Unnamed device' : device.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
