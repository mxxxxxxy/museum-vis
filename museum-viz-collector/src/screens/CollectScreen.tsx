import { ChevronDown, ChevronRight, Layers, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import type { Stats } from "../lib/draft";
import type { Draft, Unit } from "../types";

export function CollectScreen({
  draft,
  stats,
  onAddUnit,
  onOpenUnit,
  onAddItem,
  onOpenItem,
  onRemoveItem,
}: {
  draft: Draft;
  stats: Stats;
  onAddUnit: () => void;
  onOpenUnit: (unitId: string) => void;
  onAddItem: (unitId: string) => void;
  onOpenItem: (unitId: string, itemId: string) => void;
  onRemoveItem: (unitId: string, itemId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <section className="screen collect-screen">
      <button className="primary-button block" type="button" onClick={onAddUnit}>
        <Plus size={18} />
        添加展览单元
      </button>

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

      {draft.units.length > 0 ? (
        <div className="session-list">
          {draft.units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              expanded={expandedId === unit.id}
              onToggle={() =>
                setExpandedId((current) => (current === unit.id ? null : unit.id))
              }
              onOpen={() => onOpenUnit(unit.id)}
              onAddItem={() => onAddItem(unit.id)}
              onOpenItem={(itemId) => onOpenItem(unit.id, itemId)}
              onRemoveItem={(itemId) => onRemoveItem(unit.id, itemId)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Layers size={34} />}
          title="还没有展览单元"
          text="点击上面的「添加展览单元」，把展览分成一个个单元来采集。"
        />
      )}
    </section>
  );
}

function UnitCard({
  unit,
  expanded,
  onToggle,
  onOpen,
  onAddItem,
  onOpenItem,
  onRemoveItem,
}: {
  unit: Unit;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAddItem: () => void;
  onOpenItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  return (
    <div className={`unit-card${expanded ? " expanded" : ""}`}>
      <div className="unit-card-head">
        <button className="unit-card-main" type="button" onClick={onOpen}>
          <span className="serial">{unit.serial}</span>
          <span className="unit-card-text">
            <strong>{unit.name || "未命名单元"}</strong>
            <em>
              {unit.items.length} 个可视化项 · {unit.environmentAssets.length} 张环境图
            </em>
          </span>
        </button>
        <button
          className="unit-card-toggle"
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label="展开 / 收起可视化项"
        >
          <ChevronDown size={20} className={expanded ? "chevron-open" : "chevron"} />
        </button>
      </div>
      {expanded ? (
        <div className="unit-card-drawer">
          {unit.items.length === 0 ? (
            <p className="drawer-empty">这个单元还没有可视化项。</p>
          ) : (
            <ul className="viz-item-list">
              {unit.items.map((item) => (
                <li key={item.id} className="viz-item">
                  <button
                    className="viz-item-main"
                    type="button"
                    onClick={() => onOpenItem(item.id)}
                  >
                    <span className="viz-serial">{item.serial}</span>
                    <span className="viz-title">{item.title || "未命名可视化项"}</span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    className="viz-item-del"
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label="删除可视化项"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="secondary-button block" type="button" onClick={onAddItem}>
            <Plus size={16} />
            添加可视化项
          </button>
        </div>
      ) : null}
    </div>
  );
}
