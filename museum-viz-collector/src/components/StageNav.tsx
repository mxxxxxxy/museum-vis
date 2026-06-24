import { ClipboardList, Home, MapPinned } from "lucide-react";
import type { Screen } from "../types";

export function StageNav({
  screen,
  canCollect = true,
  canReview = true,
  onHome,
  onCollect,
  onReview,
}: {
  screen: Screen;
  canCollect?: boolean;
  canReview?: boolean;
  onHome: () => void;
  onCollect: () => void;
  onReview: () => void;
}) {
  if (screen === "success") return null;
  return (
    <nav className="stage-nav" aria-label="采集阶段">
      <button
        className={screen === "intro" || screen === "info" ? "active" : ""}
        type="button"
        onClick={onHome}
      >
        <Home size={18} />
        <span>1 首页</span>
      </button>
      <button
        className={screen === "collect" || screen === "unit" ? "active" : ""}
        type="button"
        onClick={onCollect}
        disabled={!canCollect}
        title={canCollect ? undefined : "请先在首页填完信息并点击「数据收集」"}
      >
        <MapPinned size={18} />
        <span>2 调研</span>
      </button>
      <button
        className={screen === "review" ? "active" : ""}
        type="button"
        onClick={onReview}
        disabled={!canReview}
        title={canReview ? undefined : "请先在首页填完信息并点击「数据收集」"}
      >
        <ClipboardList size={18} />
        <span>3 提交</span>
      </button>
    </nav>
  );
}
