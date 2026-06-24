import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileImage,
  Layers,
  User,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { MediaGrid } from "../components/MediaGrid";
import { PhotoAddControl } from "../components/PhotoAddControl";
import {
  COLLECTOR_REQUIRED_FIELDS,
  VENUE_REQUIRED_FIELDS,
  isInfoSectionComplete,
} from "../lib/draft";
import type { Draft, SubmissionInfo } from "../types";

export function IntroScreen({
  draft,
  patchInfo,
  onAddFloorplanFiles,
  onRemoveFloorplanAsset,
  onContinue,
}: {
  draft: Draft;
  patchInfo: (key: keyof SubmissionInfo, value: string) => void;
  onAddFloorplanFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFloorplanAsset: (assetId: string) => void;
  onContinue: () => void;
}) {
  const collectorComplete = isInfoSectionComplete(draft.info, COLLECTOR_REQUIRED_FIELDS);
  const venueComplete = isInfoSectionComplete(draft.info, VENUE_REQUIRED_FIELDS);
  const allComplete = collectorComplete && venueComplete;

  const [collectorOpen, setCollectorOpen] = useState(!collectorComplete);
  const [venueOpen, setVenueOpen] = useState(!venueComplete);
  const [isAddingFloorplan, setIsAddingFloorplan] = useState(false);

  return (
    <section className="screen intro-screen">
      <div className="panel">
        <p className="eyebrow structure-title">调研数据组织</p>
        <div className="hierarchy">
          <div className="hier-row">
            <span className="hier-icon">
              <Building2 size={20} />
            </span>
            <div>
              <strong>博物馆展览</strong>
              <span>收集人, 博物馆, 展览信息</span>
            </div>
          </div>
          <div className="hier-line" />
          <div className="hier-row">
            <span className="hier-icon">
              <Layers size={20} />
            </span>
            <div>
              <strong>展览单元</strong>
              <span>展厅单元, 单元描述, 环境照片</span>
            </div>
          </div>
          <div className="hier-line" />
          <div className="hier-row">
            <span className="hier-icon">
              <FileImage size={20} />
            </span>
            <div>
              <strong>展陈可视化</strong>
              <span>可视化项, 现场照片, 文字描述</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`accordion${collectorOpen ? " open" : ""}`}>
        <button
          type="button"
          className="accordion-head"
          aria-expanded={collectorOpen}
          onClick={() => setCollectorOpen((open) => !open)}
        >
          <span className="accordion-head-main">
            <span className="accordion-icon">
              <User size={20} />
            </span>
            <span className="accordion-titles">
              <strong>收集人信息</strong>
            </span>
          </span>
          <span className="accordion-head-right">
            {collectorComplete ? (
              <span className="check-badge" aria-label="已填写完整">
                <Check size={16} />
              </span>
            ) : null}
            <ChevronDown size={20} className="accordion-chevron" />
          </span>
        </button>
        {collectorOpen ? (
          <div className="accordion-body">
            <div className="form-grid">
              <InlineTextField
                label="姓名"
                value={draft.info.submitterName}
                required
                onChange={(value) => patchInfo("submitterName", value)}
              />
              <InlineTextField
                label="单位"
                value={draft.info.submitterOrg}
                required
                onChange={(value) => patchInfo("submitterOrg", value)}
              />
              <InlineTextField
                label="联系方式"
                value={draft.info.submitterContact}
                placeholder="邮箱或手机号"
                className="field-wide"
                onChange={(value) => patchInfo("submitterContact", value)}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className={`accordion${venueOpen ? " open" : ""}`}>
        <button
          type="button"
          className="accordion-head"
          aria-expanded={venueOpen}
          onClick={() => setVenueOpen((open) => !open)}
        >
          <span className="accordion-head-main">
            <span className="accordion-icon">
              <Building2 size={20} />
            </span>
            <span className="accordion-titles">
              <strong>博物馆与展览信息</strong>
            </span>
          </span>
          <span className="accordion-head-right">
            {venueComplete ? (
              <span className="check-badge" aria-label="已填写完整">
                <Check size={16} />
              </span>
            ) : null}
            <ChevronDown size={20} className="accordion-chevron" />
          </span>
        </button>
        {venueOpen ? (
          <div className="accordion-body">
            <div className="form-grid venue-form-grid">
              <InlineTextField
                label="调研时间"
                type="date"
                value={draft.info.visitDate}
                required
                onChange={(value) => patchInfo("visitDate", value)}
              />
              <InlineTextField
                label="所在城市"
                value={draft.info.city}
                required
                onChange={(value) => patchInfo("city", value)}
              />
              <InlineTextField
                label="博物馆名称"
                value={draft.info.museumName}
                required
                onChange={(value) => patchInfo("museumName", value)}
              />
              <InlineTextField
                label="博物馆地址"
                value={draft.info.museumAddress}
                required
                onChange={(value) => patchInfo("museumAddress", value)}
              />
              <InlineTextField
                label="展览名称"
                value={draft.info.exhibitionName}
                required
                onChange={(value) => patchInfo("exhibitionName", value)}
              />
              <InlineTextField
                label="展览举办时间"
                value={draft.info.exhibitionPeriod}
                required
                placeholder="如 2024.09 — 2025.03 或 常设展"
                onChange={(value) => patchInfo("exhibitionPeriod", value)}
              />
              <InlineTextField
                label="展览在线链接"
                value={draft.info.exhibitionLink}
                placeholder="如有官网、公众号或购票页"
                className="field-wide"
                onChange={(value) => patchInfo("exhibitionLink", value)}
              />
              <label className="field field-wide">
                <span>展览介绍</span>
                <textarea
                  value={draft.info.exhibitionIntro}
                  placeholder="可以简单写展览主题、规模、展品类型，也可以稍后补充。"
                  onChange={(event) => patchInfo("exhibitionIntro", event.target.value)}
                />
              </label>
              <div className="field-block field-wide">
                <div className="block-title photo-title-bar">
                  <h4>展览平面图</h4>
                  <PhotoAddControl
                    ariaLabel="添加展览平面图"
                    isOpen={isAddingFloorplan}
                    onToggle={() => setIsAddingFloorplan((current) => !current)}
                    onAddFiles={(event) => {
                      onAddFloorplanFiles(event);
                      setIsAddingFloorplan(false);
                    }}
                  />
                </div>
                <p className="field-helper">
                  若博物馆展览提供，强烈建议将展陈平面图、导览图等内容采集。
                </p>
                <MediaGrid assets={draft.floorplanAssets} onRemove={onRemoveFloorplanAsset} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="action-row">
        <button
          className="primary-button"
          type="button"
          onClick={onContinue}
          disabled={!allComplete}
        >
          数据收集
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

function InlineTextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`inline-field${className ? ` ${className}` : ""}`}>
      <span className="inline-field-label">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {required ? <b className="inline-field-required">必填</b> : null}
    </label>
  );
}
