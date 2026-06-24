import { ArrowLeft, Check, FileImage, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PhotoAddControl } from "../components/PhotoAddControl";
import { VoiceInputButton } from "../components/VoiceInputButton";
import { itemDescriptionSections } from "../constants";
import { getItemMissingFields } from "../lib/draft";
import { formatBytes } from "../lib/media";
import type { AssetRole, MediaAsset, Unit, VizItem } from "../types";

const photoTypeOptions = ["周围环境", "完整视图", "关键细节", "其他"];
const defaultPhotoType = "其他";

export function ItemScreen({
  unit,
  activeItemId,
  onBack,
  onConfirm,
  onPatchItem,
  onAddItemFiles,
  onTranscribeItemAudio,
  onRemoveItemAsset,
}: {
  unit: Unit;
  activeItemId: string | null;
  onBack: () => void;
  onConfirm: () => void;
  onPatchItem: (itemId: string, patch: Partial<VizItem>) => void;
  onAddItemFiles: (
    event: ChangeEvent<HTMLInputElement>,
    itemId: string,
    label: string,
    role?: AssetRole,
  ) => void;
  onTranscribeItemAudio: (itemId: string, section: string, blob: Blob) => Promise<string>;
  onRemoveItemAsset: (itemId: string, assetId: string) => void;
}) {
  const activeItem = unit.items.find((item) => item.id === activeItemId) ?? unit.items[0];

  if (!activeItem) {
    return (
      <section className="screen session-screen">
        <div className="screen-top">
          <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="panel">
          <EmptyState
            icon={<FileImage size={34} />}
            title="可视化项不存在"
            text="它可能已被删除，请返回采集页重新选择或添加。"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="screen session-screen">
      <div className="panel">
        <ItemEditor
          item={activeItem}
          onBack={onBack}
          onConfirm={onConfirm}
          onPatch={(patch) => onPatchItem(activeItem.id, patch)}
          onAddFiles={(event, label, role) => onAddItemFiles(event, activeItem.id, label, role)}
          onTranscribeAudio={(section, blob) =>
            onTranscribeItemAudio(activeItem.id, section, blob)
          }
          onRemoveAsset={(assetId) => onRemoveItemAsset(activeItem.id, assetId)}
        />
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  onBack,
  onConfirm,
  onPatch,
  onAddFiles,
  onTranscribeAudio,
  onRemoveAsset,
}: {
  item: VizItem;
  onBack: () => void;
  onConfirm: () => void;
  onPatch: (patch: Partial<VizItem>) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>, label: string, role?: AssetRole) => void;
  onTranscribeAudio: (section: string, blob: Blob) => Promise<string>;
  onRemoveAsset: (assetId: string) => void;
}) {
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [didTryConfirm, setDidTryConfirm] = useState(false);
  const missingFields = didTryConfirm ? getItemMissingFields(item) : [];
  const titleInvalid = missingFields.includes("名称");
  const photosInvalid = missingFields.includes("现场照片");

  function handleConfirm() {
    setDidTryConfirm(true);
    onConfirm();
  }

  return (
    <div className="item-editor">
      <div className="item-name-block">
        <div className="item-name-bar">
          <button className="secondary-button small" type="button" onClick={onBack}>
            <ArrowLeft size={16} /> 返回
          </button>
          <button
            className="primary-button small"
            type="button"
            onClick={handleConfirm}
          >
            <Check size={16} /> 确认
          </button>
        </div>
        <InlineTextField
          label="名称"
          value={item.title}
          required
          invalid={titleInvalid}
          placeholder="例如：百年校史时间线"
          onChange={(value) => onPatch({ title: value })}
        />
      </div>

      <InlineTextField
        label="位置"
        value={item.locationDescription}
        placeholder="可选，如入口右侧墙面、展柜旁。"
        onChange={(value) => onPatch({ locationDescription: value })}
      />

      <div className={`field-block${photosInvalid ? " field-block-invalid" : ""}`}>
        <div className="block-title photo-title-bar">
          <h4>
            现场照片
            <span className="required-badge">必填</span>
          </h4>
          <PhotoAddControl
            ariaLabel="添加现场照片"
            isOpen={isAddingPhoto}
            onToggle={() => setIsAddingPhoto((current) => !current)}
            onAddFiles={(event) => {
              onAddFiles(event, defaultPhotoType);
              setIsAddingPhoto(false);
            }}
          />
        </div>
        <PhotoCaptureRows
          assets={item.photos}
          onRemoveAsset={onRemoveAsset}
          onChangePhotoType={(assetId, label) =>
            onPatch({
              photos: item.photos.map((asset) =>
                asset.id === assetId ? { ...asset, label } : asset,
              ),
            })
          }
        />
      </div>

      <div className="description-sections">
        <div className="description-section-grid">
          {itemDescriptionSections.map((section) => (
            <div
              className={`field field-wide description-section${
                missingFields.includes(section.missingLabel) ? " field-invalid" : ""
              }`}
              key={section.key}
            >
              <span>
                <span className="description-section-title">
                  {section.title}
                  {section.required ? <b>必填</b> : null}
                </span>
                <VoiceInputButton
                  onText={(text) =>
                    onPatch({
                      description: {
                        ...item.description,
                        [section.key]: joinTranscript(item.description[section.key], text),
                      },
                    })
                  }
                  onTranscribe={(blob) => onTranscribeAudio(section.key, blob)}
                />
              </span>
              <p className="field-helper">{section.helper}</p>
              <textarea
                value={item.description[section.key]}
                placeholder={section.placeholder}
                onChange={(event) =>
                  onPatch({
                    description: {
                      ...item.description,
                      [section.key]: event.target.value,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InlineTextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className={`inline-field${invalid ? " inline-field-invalid" : ""}`}>
      <span className="inline-field-label">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {required ? <b className="inline-field-required">必填</b> : null}
    </label>
  );
}

function PhotoCaptureRows({
  assets,
  onRemoveAsset,
  onChangePhotoType,
}: {
  assets: MediaAsset[];
  onRemoveAsset: (assetId: string) => void;
  onChangePhotoType: (assetId: string, label: string) => void;
}) {
  const imageAssets = assets.filter(isImagePhotoAsset);
  if (!imageAssets.length) return null;

  return (
    <div className="photo-upload-panel">
      <div className="photo-gallery">
        {imageAssets.map((asset) => {
          const src = asset.url || asset.dataUrl || "";
          const photoType = photoTypeOptions.includes(asset.label)
            ? asset.label
            : defaultPhotoType;
          return (
            <div className="photo-card" key={asset.id}>
              <img src={src} alt={photoType} />
              <span className="photo-card-size">{formatBytes(asset.size)}</span>
              <button
                className="photo-card-remove"
                type="button"
                onClick={() => onRemoveAsset(asset.id)}
                aria-label="删除照片"
              >
                <Trash2 size={14} />
              </button>
              <select
                aria-label="选择图片类型"
                value={photoType}
                onChange={(event) => onChangePhotoType(asset.id, event.target.value)}
              >
                {photoTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function joinTranscript(existing: string, addition: string) {
  const base = existing.trimEnd();
  if (!base) return addition;
  return /[，。！？、；：,.!?;:]$/.test(base) ? `${base}${addition}` : `${base} ${addition}`;
}

function isImagePhotoAsset(asset: MediaAsset) {
  return asset.role === "photo" && asset.type.startsWith("image/");
}
