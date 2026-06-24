import { Camera, Check, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { MediaGrid } from "../components/MediaGrid";
import { MediaInputGroup } from "../components/MediaInput";
import { TextField } from "../components/TextField";
import type { AssetRole, Unit } from "../types";

export function UnitScreen({
  unit,
  onBack,
  onPatchUnit,
  onRemoveUnit,
  onAddUnitFiles,
  onRemoveUnitAsset,
}: {
  unit: Unit;
  onBack: () => void;
  onPatchUnit: (patch: Partial<Unit>) => void;
  onRemoveUnit: () => void;
  onAddUnitFiles: (event: ChangeEvent<HTMLInputElement>, role: AssetRole, label: string) => void;
  onRemoveUnitAsset: (assetId: string) => void;
}) {
  return (
    <section className="screen session-screen">
      <div className="panel">
        <div className="section-heading">
          <h2>单元信息</h2>
          <div className="section-heading-actions">
            <button
              className="primary-button small"
              type="button"
              onClick={onBack}
              disabled={!unit.name.trim() || !unit.description.trim()}
            >
              <Check size={16} /> 确认
            </button>
            <button className="icon-button danger" type="button" onClick={onRemoveUnit}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <div className="form-grid compact">
          <TextField
            label="单元名称"
            value={unit.name}
            required
            placeholder="例如：序幕厅、今日北大展厅"
            className="field-wide"
            onChange={(value) => onPatchUnit({ name: value })}
          />
          <label className="field field-wide">
            <span>单元描述</span>
            <textarea
              value={unit.description}
              placeholder="可以从两方面描述：① 位置——它在展览中的位置（如首层东侧、入口右手边、主展线中段）；② 环境——人流、灯光、遮挡、展线方向等。"
              onChange={(event) => onPatchUnit({ description: event.target.value })}
            />
          </label>
        </div>

        <div className="upload-grid">
          <MediaInputGroup
            icon={<Camera size={18} />}
            cameraLabel="拍环境照"
            libraryLabel="选环境照"
            onChange={(event) => onAddUnitFiles(event, "environment", "环境照")}
          />
        </div>
        <MediaGrid assets={unit.environmentAssets} onRemove={onRemoveUnitAsset} />
      </div>
    </section>
  );
}
