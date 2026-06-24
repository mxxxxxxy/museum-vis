import { Camera, ImagePlus, Plus } from "lucide-react";
import type { ChangeEvent } from "react";

export function PhotoAddControl({
  ariaLabel,
  isOpen,
  onToggle,
  onAddFiles,
}: {
  ariaLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="photo-add-wrap">
      <button
        className="photo-add-button"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <Plus size={18} />
      </button>
      {isOpen ? (
        <div className="photo-add-menu">
          <label>
            <Camera size={17} />
            <span>拍摄</span>
            <input type="file" accept="image/*" capture="environment" onChange={onAddFiles} />
          </label>
          <label>
            <ImagePlus size={17} />
            <span>选照片</span>
            <input type="file" accept="image/*" multiple onChange={onAddFiles} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
