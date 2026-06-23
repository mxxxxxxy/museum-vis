import { Check, Download } from "lucide-react";
import { useMemo } from "react";
import { ScreenTop } from "../components/ScreenTop";
import { StatCard } from "../components/StatCard";
import { getRequiredInfoMissing, type Stats } from "../lib/draft";
import type { Draft } from "../types";

export function ReviewScreen({
  draft,
  stats,
  onBack,
  onExport,
  onSubmit,
}: {
  draft: Draft;
  stats: Stats;
  onBack: () => void;
  onExport: () => void;
  onSubmit: () => void;
}) {
  const warnings = useMemo(() => {
    const messages: string[] = [];
    if (getRequiredInfoMissing(draft.info).length) messages.push("基础信息不完整");
    if (!draft.units.length) messages.push("还没有添加任何展览单元");
    draft.units.forEach((unit) => {
      const unitName = unit.name ? `${unit.serial}（${unit.name}）` : unit.serial;
      if (!unit.name.trim()) {
        messages.push(`${unit.serial} 缺少单元名称`);
      }
      if (!unit.environmentAssets.length) {
        messages.push(`${unitName} 缺少环境照片`);
      }
      if (!unit.items.length) {
        messages.push(`${unitName} 还没有可视化项`);
      }
      unit.items.forEach((item) => {
        const label = item.title ? `${item.serial}（${item.title}）` : item.serial;
        if (!item.photos.length) {
          messages.push(`${label} 缺少现场照片`);
        }
        if (!item.description.trim()) {
          messages.push(`${label} 缺少文字描述`);
        }
        if (!item.visualizationTypes.length) {
          messages.push(`${label} 未选择可视化类型`);
        }
      });
    });
    return messages;
  }, [draft]);

  return (
    <section className="screen">
      <ScreenTop title="提交前检查" subtitle="确认结构、照片和描述是否足够分析。" onBack={onBack} />
      <div className="stats-grid">
        <StatCard label="展览单元" value={stats.units} />
        <StatCard label="可视化项" value={stats.items} />
        <StatCard label="照片" value={stats.assets} />
      </div>
      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">完整性</p>
            <h2>完整性提示</h2>
          </div>
          {warnings.length === 0 ? <span className="status-ok">可提交</span> : null}
        </div>
        {warnings.length ? (
          <ul className="warning-list">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <div className="ready-line">
            <Check size={18} />
            当前草稿已经包含基础信息、单元环境、可视化项照片和文字描述。
          </div>
        )}
      </div>
      <div className="panel">
        <h2>数据概览</h2>
        <pre className="json-preview">
          {JSON.stringify(
            {
              提交编号: draft.id,
              收集人: draft.info.submitterName,
              博物馆: draft.info.museumName,
              展览: draft.info.exhibitionName,
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
      </div>
      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onExport}>
          <Download size={18} />
          导出数据包
        </button>
        <button className="primary-button" type="button" onClick={onSubmit}>
          <Check size={18} />
          模拟提交
        </button>
      </div>
    </section>
  );
}
