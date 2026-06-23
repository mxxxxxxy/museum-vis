import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";

export function MediaInputGroup({
  icon,
  cameraLabel,
  libraryLabel,
  onChange,
}: {
  icon: React.ReactNode;
  cameraLabel: string;
  libraryLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="media-input-group">
      <CaptureButton
        icon={icon}
        label={cameraLabel}
        accept="image/*"
        capture="environment"
        onChange={onChange}
      />
      <CaptureButton
        icon={<Upload size={18} />}
        label={libraryLabel}
        accept="image/*"
        multiple
        onChange={onChange}
      />
    </div>
  );
}

function CaptureButton({
  icon,
  label,
  accept,
  capture,
  multiple,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="capture-button">
      {icon}
      <span>{label}</span>
      <input type="file" accept={accept} capture={capture} multiple={multiple} onChange={onChange} />
    </label>
  );
}
