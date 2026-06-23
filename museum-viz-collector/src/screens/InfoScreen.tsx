import { Building2, Check, ChevronRight, Trash2, User } from "lucide-react";
import { TextField } from "../components/TextField";
import type { Draft, SubmissionInfo } from "../types";

export function InfoScreen({
  draft,
  missingInfo,
  patchInfo,
  onContinue,
  onReset,
}: {
  draft: Draft;
  missingInfo: string[];
  patchInfo: (key: keyof SubmissionInfo, value: string) => void;
  onContinue: () => void;
  onReset: () => void;
}) {
  return (
    <section className="screen">
      <div className="form-heading">
        <div>
          <h2>填写基础信息</h2>
        </div>
        <p>只填一次，后续单元和可视化项自动归入本次提交。</p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">第一部分</p>
            <h2>收集人信息</h2>
          </div>
          <User size={22} className="heading-icon" />
        </div>
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

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">第二部分</p>
            <h2>博物馆与展览</h2>
          </div>
          <Building2 size={22} className="heading-icon" />
        </div>
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

      {missingInfo.length > 0 ? (
        <div className="soft-warning">还缺：{missingInfo.join("、")}</div>
      ) : (
        <div className="ready-line">
          <Check size={18} />
          基础信息已满足进入采集的要求
        </div>
      )}

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onReset}>
          <Trash2 size={18} />
          清空草稿
        </button>
        <button className="primary-button" type="button" onClick={onContinue}>
          进入采集
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
