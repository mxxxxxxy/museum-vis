import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileImage,
  Layers,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";
import { TextField } from "../components/TextField";
import {
  COLLECTOR_REQUIRED_FIELDS,
  VENUE_REQUIRED_FIELDS,
  isInfoSectionComplete,
} from "../lib/draft";
import type { Draft, SubmissionInfo } from "../types";

export function IntroScreen({
  draft,
  patchInfo,
  onContinue,
  onReset,
}: {
  draft: Draft;
  patchInfo: (key: keyof SubmissionInfo, value: string) => void;
  onContinue: () => void;
  onReset: () => void;
}) {
  const collectorComplete = isInfoSectionComplete(draft.info, COLLECTOR_REQUIRED_FIELDS);
  const venueComplete = isInfoSectionComplete(draft.info, VENUE_REQUIRED_FIELDS);
  const allComplete = collectorComplete && venueComplete;

  const [collectorOpen, setCollectorOpen] = useState(!collectorComplete);
  const [venueOpen, setVenueOpen] = useState(!venueComplete);

  return (
    <section className="screen intro-screen">
      <div className={`intro-panel${allComplete ? " is-complete" : ""}`}>
        <h2>记录博物馆里的可视化，以及它所在的展陈环境</h2>
        {allComplete ? (
          <p className="intro-ready">
            <Check size={18} />
            基础信息已填完，现在可以进入「数据收集」。
          </p>
        ) : (
          <p>
            先在下面填好这次调研的基础信息（只填一次），再进入采集，按「展览 → 展览单元 → 可视化项」三层把现场可视化记录下来。
          </p>
        )}
      </div>

      <div className="panel">
        <p className="eyebrow structure-title">我们的采集数据组织结构</p>
        <div className="hierarchy">
          <div className="hier-row">
            <span className="hier-icon">
              <Building2 size={20} />
            </span>
            <div>
              <strong>展览 / 博物馆</strong>
              <span>填一次基础信息：收集人 + 博物馆 + 展览。</span>
            </div>
          </div>
          <div className="hier-line" />
          <div className="hier-row">
            <span className="hier-icon">
              <Layers size={20} />
            </span>
            <div>
              <strong>展览单元</strong>
              <span>把展览分成一个个单元，记录每个单元的空间环境。</span>
            </div>
          </div>
          <div className="hier-line" />
          <div className="hier-row">
            <span className="hier-icon">
              <FileImage size={20} />
            </span>
            <div>
              <strong>可视化项</strong>
              <span>每项拍现场照片 + 写一段文字描述 + 选可视化类型。</span>
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
              <TextField
                label="收集人姓名"
                value={draft.info.submitterName}
                required
                onChange={(value) => patchInfo("submitterName", value)}
              />
              <TextField
                label="收集人单位"
                value={draft.info.submitterOrg}
                required
                onChange={(value) => patchInfo("submitterOrg", value)}
              />
              <TextField
                label="联系方式"
                value={draft.info.submitterContact}
                placeholder="可选，邮箱或手机号，便于回访"
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
            <div className="form-grid">
              <TextField
                label="调研时间"
                type="date"
                value={draft.info.visitDate}
                required
                className="field-date"
                onChange={(value) => patchInfo("visitDate", value)}
              />
              <TextField
                label="所在城市"
                value={draft.info.city}
                required
                onChange={(value) => patchInfo("city", value)}
              />
              <TextField
                label="博物馆名称"
                value={draft.info.museumName}
                required
                onChange={(value) => patchInfo("museumName", value)}
              />
              <TextField
                label="博物馆地址"
                value={draft.info.museumAddress}
                required
                onChange={(value) => patchInfo("museumAddress", value)}
              />
              <TextField
                label="展览名称"
                value={draft.info.exhibitionName}
                required
                onChange={(value) => patchInfo("exhibitionName", value)}
              />
              <TextField
                label="展览举办时间"
                value={draft.info.exhibitionPeriod}
                placeholder="如 2024.09 — 2025.03 或 常设展"
                onChange={(value) => patchInfo("exhibitionPeriod", value)}
              />
              <TextField
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
            </div>
          </div>
        ) : null}
      </div>

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onReset}>
          <Trash2 size={18} />
          清空草稿
        </button>
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
