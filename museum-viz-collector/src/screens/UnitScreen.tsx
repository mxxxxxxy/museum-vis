import { ArrowLeft, Check, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { MediaGrid } from "../components/MediaGrid";
import { PhotoAddControl } from "../components/PhotoAddControl";
import { TextField } from "../components/TextField";
import type { AssetRole, Unit } from "../types";

export function UnitScreen({
  unit,
  onBack,
  onConfirm,
  onPatchUnit,
  onRemoveUnit,
  onAddUnitFiles,
  onRemoveUnitAsset,
}: {
  unit: Unit;
  onBack: () => void;
  onConfirm: () => void;
  onPatchUnit: (patch: Partial<Unit>) => void;
  onRemoveUnit?: () => void;
  onAddUnitFiles: (event: ChangeEvent<HTMLInputElement>, role: AssetRole, label: string) => void;
  onRemoveUnitAsset: (assetId: string) => void;
}) {
  const [didTryConfirm, setDidTryConfirm] = useState(false);
  const [isAddingEnvironmentPhoto, setIsAddingEnvironmentPhoto] = useState(false);
  const nameInvalid = didTryConfirm && unit.name.trim().length === 0;
  const descriptionInvalid = didTryConfirm && unit.description.trim().length === 0;

  function handleConfirm() {
    setDidTryConfirm(true);
    onConfirm();
  }

  return (
    <section className="screen session-screen">
      <div className="panel">
        <div className="section-heading">
          <div className="section-heading-title">
            <button className="secondary-button small" type="button" onClick={onBack}>
              <ArrowLeft size={16} /> 返回
            </button>
            <h2>单元信息</h2>
          </div>
          <div className="section-heading-actions">
            <button
              className="primary-button small"
              type="button"
              onClick={handleConfirm}
            >
              <Check size={16} /> 确认
            </button>
            {onRemoveUnit ? (
              <button className="icon-button danger" type="button" onClick={onRemoveUnit}>
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="form-grid compact">
          <TextField
            label="单元名称"
            value={unit.name}
            required
            invalid={nameInvalid}
            placeholder="如：序幕等"
            className="field-wide"
            onChange={(value) => onPatchUnit({ name: value })}
          />
          <label className={`field field-wide${descriptionInvalid ? " field-invalid" : ""}`}>
            <span>
              单元描述
              <b>必填</b>
            </span>
            <textarea
              value={unit.description}
              placeholder="包括但不限于位置、环境（人流、灯光、遮挡、展线方向）、主题等。"
              onChange={(event) => onPatchUnit({ description: event.target.value })}
            />
          </label>
        </div>

        <div className="field-block">
          <div className="block-title photo-title-bar">
            <h4>环境照片</h4>
            <PhotoAddControl
              ariaLabel="添加环境照片"
              isOpen={isAddingEnvironmentPhoto}
              onToggle={() => setIsAddingEnvironmentPhoto((current) => !current)}
              onAddFiles={(event) => {
                onAddUnitFiles(event, "environment", "环境照");
                setIsAddingEnvironmentPhoto(false);
              }}
            />
          </div>
          <p className="field-helper">拍摄一张或多张包含整个单元空间的环境照。</p>
          <MediaGrid assets={unit.environmentAssets} onRemove={onRemoveUnitAsset} />
        </div>
      </div>
    </section>
  );
}
