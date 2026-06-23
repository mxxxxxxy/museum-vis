import { ArrowLeft, Camera, FileImage } from "lucide-react";
import type { ChangeEvent } from "react";
import { ChoiceBlock } from "../components/ChoiceBlock";
import { EmptyState } from "../components/EmptyState";
import { MediaGrid } from "../components/MediaGrid";
import { MediaInputGroup } from "../components/MediaInput";
import { TextField } from "../components/TextField";
import { mediaTypeOptions, visualizationTypeOptions } from "../constants";
import type { TagKey, Unit, VizItem } from "../types";

export function ItemScreen({
  unit,
  activeItemId,
  onBack,
  onPatchItem,
  onToggleTag,
  onAddItemFiles,
  onRemoveItemAsset,
}: {
  unit: Unit;
  activeItemId: string | null;
  onBack: () => void;
  onPatchItem: (itemId: string, patch: Partial<VizItem>) => void;
  onToggleTag: (itemId: string, key: TagKey, value: string) => void;
  onAddItemFiles: (event: ChangeEvent<HTMLInputElement>, itemId: string, label: string) => void;
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
          onPatch={(patch) => onPatchItem(activeItem.id, patch)}
          onToggleTag={(key, value) => onToggleTag(activeItem.id, key, value)}
          onAddFiles={(event, label) => onAddItemFiles(event, activeItem.id, label)}
          onRemoveAsset={(assetId) => onRemoveItemAsset(activeItem.id, assetId)}
        />
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  onBack,
  onPatch,
  onToggleTag,
  onAddFiles,
  onRemoveAsset,
}: {
  item: VizItem;
  onBack: () => void;
  onPatch: (patch: Partial<VizItem>) => void;
  onToggleTag: (key: TagKey, value: string) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>, label: string) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  return (
    <div className="item-editor">
      <div className="item-name-row">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <label className="field item-name-field">
          <span>名称</span>
          <input
            type="text"
            value={item.title}
            placeholder="例如：北大百年校史时间线"
            onChange={(event) => onPatch({ title: event.target.value })}
          />
        </label>
      </div>

      <TextField
        label="位置"
        value={item.locationDescription}
        placeholder="可选，如入口右侧墙面、展柜旁。"
        onChange={(value) => onPatch({ locationDescription: value })}
      />

      <div className="field-block">
        <div className="block-title">
          <h4>现场照片</h4>
          <p>建议拍三类：环境位置、正面完整、关键细节。</p>
        </div>
        <div className="upload-grid">
          <MediaInputGroup
            icon={<Camera size={18} />}
            cameraLabel="拍照"
            libraryLabel="从相册选"
            onChange={(event) => onAddFiles(event, "现场照片")}
          />
        </div>
        <MediaGrid assets={item.photos} onRemove={onRemoveAsset} />
      </div>

      <label className="field field-wide field-emphasis">
        <span>
          文字描述
          <b>重点</b>
        </span>
        <textarea
          value={item.description}
          placeholder="写一段描述：它画了什么？有哪些主要部分？主要在讲什么信息？在展览里起什么作用？好不好懂？"
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </label>

      <ChoiceBlock
        title="可视化类型"
        values={item.visualizationTypes}
        options={visualizationTypeOptions}
        onToggle={(value) => onToggleTag("visualizationTypes", value)}
      />
      <ChoiceBlock
        title="展陈媒介"
        values={item.mediaTypes}
        options={mediaTypeOptions}
        onToggle={(value) => onToggleTag("mediaTypes", value)}
      />
    </div>
  );
}
