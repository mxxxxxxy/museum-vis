import { Check, ChevronDown, ChevronRight, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { getItemMissingFields, getRequiredInfoMissing, type Stats } from "../lib/draft";
import type { Draft } from "../types";

export type ReviewTarget =
  | { type: "info" }
  | { type: "collect"; unitId?: string }
  | { type: "unit"; unitId: string }
  | { type: "item"; unitId: string; itemId: string };

type ReviewWarning = { message: string; target: ReviewTarget };

export function ReviewScreen({
  draft,
  stats,
  onJumpTo,
  onExport,
  showExportActions,
  onSubmit,
}: {
  draft: Draft;
  stats: Stats;
  onJumpTo: (target: ReviewTarget) => void;
  onExport: () => void;
  showExportActions: boolean;
  onSubmit: () => void;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);

  const warnings = useMemo<ReviewWarning[]>(() => {
    const messages: ReviewWarning[] = [];
    if (getRequiredInfoMissing(draft.info).length) {
      messages.push({ message: "基础信息不完整", target: { type: "info" } });
    }
    if (!draft.units.length) {
      messages.push({ message: "还没有添加任何展览单元", target: { type: "collect" } });
    }
    draft.units.forEach((unit) => {
      const unitName = unit.name ? `${unit.serial}（${unit.name}）` : unit.serial;
      if (!unit.name.trim()) {
        messages.push({ message: `${unit.serial} 缺少单元名称`, target: { type: "unit", unitId: unit.id } });
      }
      if (!unit.description.trim()) {
        messages.push({ message: `${unitName} 缺少单元描述`, target: { type: "unit", unitId: unit.id } });
      }
      if (!unit.environmentAssets.length) {
        messages.push({ message: `${unitName} 缺少环境照片`, target: { type: "unit", unitId: unit.id } });
      }
      if (!unit.items.length) {
        messages.push({ message: `${unitName} 还没有可视化项`, target: { type: "collect", unitId: unit.id } });
      }
      unit.items.forEach((item) => {
        const label = item.title ? `${item.serial}（${item.title}）` : item.serial;
        getItemMissingFields(item).forEach((field) => {
          messages.push({
            message: `${label} 缺少${field}`,
            target: { type: "item", unitId: unit.id, itemId: item.id },
          });
        });
      });
    });
    return messages;
  }, [draft]);

  return (
    <section className="screen review-screen">
      <div className="panel">
        <h2>统计</h2>
        <div className="stats-line">
          <span>
            展览单元：<strong>{stats.units}</strong>
          </span>
          <span>
            可视化项：<strong>{stats.items}</strong>
          </span>
          <span>
            照片：<strong>{stats.assets}</strong>
          </span>
        </div>
      </div>
      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>缺失信息</h2>
          </div>
          {warnings.length === 0 ? <span className="status-ok">可提交</span> : null}
        </div>
        {warnings.length ? (
          <ul className="warning-list">
            {warnings.map((warning, index) => (
              <li key={`${warning.message}-${index}`}>
                <button
                  className="warning-jump"
                  type="button"
                  onClick={() => onJumpTo(warning.target)}
                  title="点击前往采集对应位置补充"
                >
                  <span>{warning.message}</span>
                  <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="panel">
        <button
          type="button"
          className="collapse-head"
          onClick={() => setOverviewOpen((open) => !open)}
          aria-expanded={overviewOpen}
        >
          <h2>数据概览</h2>
          <ChevronDown size={20} className={overviewOpen ? "chevron-open" : "chevron"} />
        </button>
        {overviewOpen ? (
          <pre className="json-preview">
            {JSON.stringify(
              {
                提交编号: draft.id,
                收集人: draft.info.submitterName,
                手机号: draft.info.submitterPhone,
                博物馆: draft.info.museumName,
                展览: draft.info.exhibitionName,
                展览平面图: draft.floorplanAssets.length,
                展览单元: draft.units.map((unit) => ({
                  编号: unit.serial,
                  名称: unit.name || "未命名",
                  可视化项: unit.items.map((item) => item.title || item.serial),
                })),
              },
              null,
              2,
            )}
          </pre>
        ) : null}
      </div>
      <div className="action-row">
        {showExportActions ? (
          <button className="secondary-button" type="button" onClick={onExport}>
            <Download size={18} />
            导出数据包
          </button>
        ) : null}
        <button
          className="primary-button"
          type="button"
          onClick={onSubmit}
          disabled={warnings.length > 0}
          title={warnings.length > 0 ? "请先补全缺失信息再提交" : undefined}
        >
          <Check size={18} />
          提交
        </button>
      </div>
    </section>
  );
}
