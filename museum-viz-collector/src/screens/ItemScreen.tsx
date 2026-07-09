import { ArrowLeft, Check, FileImage, Info, MapPin, Trash2, X } from "lucide-react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { HeicImage } from "../components/HeicImage";
import { PhotoAddControl } from "../components/PhotoAddControl";
import { VoiceInputButton } from "../components/VoiceInputButton";
import { itemDescriptionSections } from "../constants";
import { getItemMissingFields } from "../lib/draft";
import { formatBytes } from "../lib/media";
import type {
  AssetRole,
  FloorplanLocation,
  MediaAsset,
  Unit,
  VizDescriptionKey,
  VizItem,
} from "../types";

const photoTypeOptions = ["周围环境", "完整视图", "关键细节", "其他"];
const defaultPhotoType = "其他";

export function ItemScreen({
  unit,
  activeItemId,
  floorplanAssets,
  onBack,
  onConfirm,
  onPatchItem,
  onAddItemFiles,
  onTranscribeItemAudio,
  onRemoveItemAsset,
}: {
  unit: Unit;
  activeItemId: string | null;
  floorplanAssets: MediaAsset[];
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
          floorplanAssets={floorplanAssets}
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
  floorplanAssets,
  onPatch,
  onAddFiles,
  onTranscribeAudio,
  onRemoveAsset,
}: {
  item: VizItem;
  onBack: () => void;
  onConfirm: () => void;
  floorplanAssets: MediaAsset[];
  onPatch: (patch: Partial<VizItem>) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>, label: string, role?: AssetRole) => void;
  onTranscribeAudio: (section: string, blob: Blob) => Promise<string>;
  onRemoveAsset: (assetId: string) => void;
}) {
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [didTryConfirm, setDidTryConfirm] = useState(false);
  const [openHelpKey, setOpenHelpKey] = useState<VizDescriptionKey | null>(null);
  const missingFields = didTryConfirm ? getItemMissingFields(item) : [];
  const titleInvalid = missingFields.includes("名称");
  const photosInvalid = missingFields.includes("现场照片");

  useEffect(() => {
    if (!openHelpKey) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".description-help-button, .description-help-popover")) return;
      setOpenHelpKey(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openHelpKey]);

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

      <FloorplanPointField
        assets={floorplanAssets}
        value={item.floorplanLocation}
        onChange={(floorplanLocation) => onPatch({ floorplanLocation })}
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
          {itemDescriptionSections.map((section) => {
            const isHelpOpen = openHelpKey === section.key;

            return (
              <div
                className={`field field-wide description-section${
                  missingFields.includes(section.missingLabel) ? " field-invalid" : ""
                }`}
                key={section.key}
              >
                <span>
                  <span className="description-section-title">
                    {section.title}
                    <button
                      className="description-help-button"
                      type="button"
                      aria-label={`查看${section.title}填写说明`}
                      aria-expanded={isHelpOpen}
                      aria-describedby={isHelpOpen ? `${section.key}-help` : undefined}
                      title={`${section.title}填写说明`}
                      onClick={() =>
                        setOpenHelpKey((current) =>
                          current === section.key ? null : section.key,
                        )
                      }
                    >
                      <Info size={14} />
                    </button>
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
                {isHelpOpen ? (
                  <div
                    className="description-help-popover"
                    id={`${section.key}-help`}
                    role="note"
                  >
                    <p>{section.helper}</p>
                  </div>
                ) : null}
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
            );
          })}
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

function FloorplanPointField({
  assets,
  value,
  onChange,
}: {
  assets: MediaAsset[];
  value: FloorplanLocation | null;
  onChange: (value: FloorplanLocation | null) => void;
}) {
  const imageAssets = assets.filter(isImageFloorplanAsset);
  const [selectedAssetId, setSelectedAssetId] = useState(
    value?.assetId ?? imageAssets[0]?.id ?? "",
  );
  const [isOpen, setIsOpen] = useState(Boolean(value));
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => {
    if (value?.assetId) {
      setSelectedAssetId(value.assetId);
    }
  }, [value?.assetId]);

  useEffect(() => {
    if (!imageAssets.length) return;
    if (imageAssets.some((asset) => asset.id === selectedAssetId)) return;
    setSelectedAssetId(imageAssets[0].id);
  }, [imageAssets, selectedAssetId]);

  useEffect(() => {
    if (!isInfoOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".floorplan-location-info-button, .floorplan-location-hint")) return;
      setIsInfoOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isInfoOpen]);

  if (!imageAssets.length) return null;

  const selectedAsset =
    imageAssets.find((asset) => asset.id === selectedAssetId) ?? imageAssets[0];
  const selectedPoint = value?.assetId === selectedAsset.id ? value : null;
  const src = selectedAsset.url || selectedAsset.dataUrl || "";

  function handlePick(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = clampRatio((event.clientX - rect.left) / rect.width);
    const yRatio = clampRatio((event.clientY - rect.top) / rect.height);
    onChange({ assetId: selectedAsset.id, xRatio, yRatio });
  }

  return (
    <div className="floorplan-location-field">
      <div className="block-title floorplan-location-title">
        <h4>
          标记位置
          <span
            className="floorplan-location-info-wrap"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                setIsInfoOpen(false);
              }
            }}
          >
            <button
              className="floorplan-location-info-button"
              type="button"
              aria-label="查看可视化位置说明"
              aria-expanded={isInfoOpen}
              title="可视化位置说明"
              onClick={() => setIsInfoOpen((current) => !current)}
            >
              <Info size={14} />
            </button>
            {isInfoOpen ? (
              <span className="floorplan-location-hint" role="note">
                标记该可视化在平面图上的位置。
              </span>
            ) : null}
          </span>
          {selectedPoint ? <span className="location-status">已标记</span> : null}
        </h4>
        <div className="floorplan-location-actions">
          {imageAssets.length > 1 ? (
            <select
              aria-label="选择展览平面图"
              value={selectedAsset.id}
              onChange={(event) => setSelectedAssetId(event.target.value)}
            >
              {imageAssets.map((asset, index) => (
                <option key={asset.id} value={asset.id}>
                  平面图 {index + 1}
                </option>
              ))}
            </select>
          ) : null}
          {value ? (
            <button
              className="icon-button tiny floorplan-clear-button"
              type="button"
              onClick={() => onChange(null)}
              aria-label="清除平面图位置"
              title="清除平面图位置"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            className="secondary-button small floorplan-point-button"
            type="button"
            onClick={() => setIsOpen((current) => !current)}
          >
            <MapPin size={15} />
            {isOpen ? "收起" : selectedPoint ? "查看" : "标点"}
          </button>
        </div>
      </div>
      {isOpen ? (
        <button
          className="floorplan-picker"
          type="button"
          onPointerDown={handlePick}
          aria-label="在平面图上标记位置"
        >
          <HeicImage
            src={src}
            type={selectedAsset.type}
            name={selectedAsset.name}
            alt="展览平面图"
            draggable={false}
          />
          {selectedPoint ? (
            <span
              className="floorplan-marker"
              style={{
                left: `${selectedPoint.xRatio * 100}%`,
                top: `${selectedPoint.yRatio * 100}%`,
              }}
            >
              <MapPin size={26} />
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
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
              <HeicImage src={src} type={asset.type} name={asset.name} alt={photoType} />
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

function isImageFloorplanAsset(asset: MediaAsset) {
  return asset.role === "floorplan" && asset.type.startsWith("image/");
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
