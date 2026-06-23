import { Trash2 } from "lucide-react";
import { formatBytes } from "../lib/media";
import type { MediaAsset } from "../types";

export function MediaGrid({
  assets,
  emptyText,
  onRemove,
}: {
  assets: MediaAsset[];
  emptyText?: string;
  onRemove: (assetId: string) => void;
}) {
  if (!assets.length) return emptyText ? <div className="empty-media">{emptyText}</div> : null;
  return (
    <div className="media-grid">
      {assets.map((asset) => (
        <div className="media-tile" key={asset.id}>
          <img src={asset.dataUrl} alt={asset.label} />
          <div className="media-meta">
            <strong>{asset.label}</strong>
            <span>{formatBytes(asset.size)}</span>
          </div>
          <button
            className="remove-media"
            type="button"
            onClick={() => onRemove(asset.id)}
            aria-label="删除照片"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
