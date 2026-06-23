import { Save } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { StageNav } from "./components/StageNav";
import { STORAGE_KEY } from "./constants";
import {
  countAssets,
  createDraft,
  createItem,
  createUnit,
  getRequiredInfoMissing,
  normalizeDraft,
  normalizeUnits,
  renumberItems,
} from "./lib/draft";
import { downloadTextFile, filesToAssets } from "./lib/media";
import { CollectScreen } from "./screens/CollectScreen";
import { InfoScreen } from "./screens/InfoScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { ItemScreen } from "./screens/ItemScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SuccessScreen } from "./screens/SuccessScreen";
import { UnitScreen } from "./screens/UnitScreen";
import type { AssetRole, Screen, SubmissionInfo, TagKey, Unit, VizItem } from "./types";

function App() {
  const [draft, setDraft] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeDraft(JSON.parse(saved)) : createDraft();
    } catch {
      return createDraft();
    }
  });
  const [screen, setScreen] = useState<Screen>("intro");
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const activeUnit = useMemo(
    () => draft.units.find((unit) => unit.id === activeUnitId) ?? null,
    [draft.units, activeUnitId],
  );

  const stats = countAssets(draft);
  const hasCollectionProgress = draft.units.length > 0;
  const missingInfo = getRequiredInfoMissing(draft.info);

  useEffect(() => {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    } catch {
      setNotice("本地草稿空间不足。请先导出当前数据包，或删除部分照片后继续采集。");
    }
  }, [draft]);

  function patchInfo(key: keyof SubmissionInfo, value: string) {
    setDraft((current) => ({
      ...current,
      info: { ...current.info, [key]: value },
    }));
  }

  function addUnit() {
    const unit = createUnit(draft.units.length + 1);
    setDraft((current) => ({
      ...current,
      units: normalizeUnits([...current.units, unit]),
    }));
    setActiveUnitId(unit.id);
    setActiveItemId(null);
    setScreen("unit");
  }

  function patchUnit(unitId: string, patch: Partial<Unit>) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit)),
    }));
  }

  function removeUnit(unitId: string) {
    const confirmed = window.confirm("确定删除这个展览单元吗？单元内的可视化项也会一并删除。");
    if (!confirmed) return;
    setDraft((current) => {
      const nextUnits = normalizeUnits(current.units.filter((unit) => unit.id !== unitId));
      setActiveUnitId(null);
      setActiveItemId(null);
      setScreen("collect");
      return { ...current, units: nextUnits };
    });
  }

  function addItem(unitId: string) {
    const unit = draft.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    const item = createItem(unit.items.length + 1);
    setDraft((current) => ({
      ...current,
      units: current.units.map((candidate) =>
        candidate.id === unitId
          ? { ...candidate, items: [...candidate.items, item] }
          : candidate,
      ),
    }));
    setActiveUnitId(unitId);
    setActiveItemId(item.id);
    setScreen("item");
  }

  function patchItem(unitId: string, itemId: string, patch: Partial<VizItem>) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        return {
          ...unit,
          items: unit.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
        };
      }),
    }));
  }

  function removeItem(unitId: string, itemId: string) {
    const confirmed = window.confirm("确定删除这个可视化项吗？它的照片和文字描述也会一并删除。");
    if (!confirmed) return;
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              items: renumberItems(unit.items.filter((item) => item.id !== itemId)),
            }
          : unit,
      ),
    }));
    if (activeItemId === itemId) setActiveItemId(null);
  }

  async function addUnitFiles(
    event: ChangeEvent<HTMLInputElement>,
    unitId: string,
    role: AssetRole,
    label: string,
  ) {
    if (!event.target.files?.length) return;
    const assets = await filesToAssets(event.target.files, role, label);
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) =>
        unit.id === unitId
          ? { ...unit, environmentAssets: [...unit.environmentAssets, ...assets] }
          : unit,
      ),
    }));
    event.target.value = "";
  }

  async function addItemFiles(
    event: ChangeEvent<HTMLInputElement>,
    unitId: string,
    itemId: string,
    label: string,
  ) {
    if (!event.target.files?.length) return;
    const assets = await filesToAssets(event.target.files, "photo", label);
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        return {
          ...unit,
          items: unit.items.map((item) =>
            item.id === itemId ? { ...item, photos: [...item.photos, ...assets] } : item,
          ),
        };
      }),
    }));
    event.target.value = "";
  }

  function removeAsset(unitId: string, assetId: string, itemId?: string) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        if (!itemId) {
          return {
            ...unit,
            environmentAssets: unit.environmentAssets.filter((asset) => asset.id !== assetId),
          };
        }
        return {
          ...unit,
          items: unit.items.map((item) =>
            item.id === itemId
              ? { ...item, photos: item.photos.filter((asset) => asset.id !== assetId) }
              : item,
          ),
        };
      }),
    }));
  }

  function toggleTag(unitId: string, itemId: string, key: TagKey, value: string) {
    const item = draft.units
      .find((candidate) => candidate.id === unitId)
      ?.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const values = item[key];
    const nextValues = values.includes(value)
      ? values.filter((candidate) => candidate !== value)
      : [...values, value];
    patchItem(unitId, itemId, { [key]: nextValues } as Partial<VizItem>);
  }

  function continueFromInfo() {
    if (missingInfo.length > 0) {
      setNotice(`请先补充：${missingInfo.join("、")}`);
      return;
    }
    setNotice("");
    setScreen("collect");
  }

  function openUnit(unitId: string) {
    setActiveUnitId(unitId);
    setActiveItemId(null);
    setScreen("unit");
  }

  function openItem(unitId: string, itemId: string) {
    setActiveUnitId(unitId);
    setActiveItemId(itemId);
    setScreen("item");
  }

  function exportDraft() {
    const payload = {
      ...draft,
      exportedAt: new Date().toISOString(),
      note: "媒体文件以内嵌方式保存在导出数据中，适合原型验证；正式版本建议上传到对象存储。",
    };
    downloadTextFile(`${draft.id}-museum-viz-submission.json`, JSON.stringify(payload, null, 2));
  }

  function resetDraft() {
    const confirmed = window.confirm("确定清空当前本地草稿吗？这个操作无法恢复。");
    if (!confirmed) return;
    setDraft(createDraft());
    setScreen("intro");
    setActiveUnitId(null);
    setActiveItemId(null);
    setNotice("已清空本地草稿。");
  }

  function submitDraft() {
    setScreen("success");
    exportDraft();
  }

  return (
    <div className="app-shell">
      <div className="top-stack">
        <header className="app-header">
          <div>
            <p className="eyebrow">博物馆展陈可视化调查</p>
            <h1>博物馆可视化采集</h1>
          </div>
          <div className="draft-pill">
            <Save size={16} />
            <span>本地草稿</span>
          </div>
        </header>

        <StageNav
          screen={screen}
          onHome={() => setScreen("intro")}
          onCollect={() => setScreen("collect")}
          onReview={() => setScreen("review")}
        />
      </div>

      <main className="app-main">
        {notice ? <div className="notice">{notice}</div> : null}

        {screen === "intro" ? (
          <IntroScreen
            hasBasicInfo={missingInfo.length === 0}
            hasCollectionProgress={hasCollectionProgress}
            onStart={() => setScreen("info")}
            onContinue={() => setScreen(hasCollectionProgress ? "collect" : "info")}
          />
        ) : null}

        {screen === "info" ? (
          <InfoScreen
            draft={draft}
            missingInfo={missingInfo}
            patchInfo={patchInfo}
            onContinue={continueFromInfo}
            onReset={resetDraft}
          />
        ) : null}

        {screen === "collect" ? (
          <CollectScreen
            draft={draft}
            stats={stats}
            onAddUnit={addUnit}
            onOpenUnit={openUnit}
            onAddItem={addItem}
            onOpenItem={openItem}
            onRemoveItem={removeItem}
          />
        ) : null}

        {screen === "unit" && activeUnit ? (
          <UnitScreen
            unit={activeUnit}
            onBack={() => setScreen("collect")}
            onPatchUnit={(patch) => patchUnit(activeUnit.id, patch)}
            onRemoveUnit={() => removeUnit(activeUnit.id)}
            onAddUnitFiles={(event, role, label) => addUnitFiles(event, activeUnit.id, role, label)}
            onRemoveUnitAsset={(assetId) => removeAsset(activeUnit.id, assetId)}
          />
        ) : null}

        {screen === "item" && activeUnit ? (
          <ItemScreen
            unit={activeUnit}
            activeItemId={activeItemId}
            onBack={() => setScreen("collect")}
            onPatchItem={(itemId, patch) => patchItem(activeUnit.id, itemId, patch)}
            onToggleTag={(itemId, key, value) => toggleTag(activeUnit.id, itemId, key, value)}
            onAddItemFiles={(event, itemId, label) =>
              addItemFiles(event, activeUnit.id, itemId, label)
            }
            onRemoveItemAsset={(itemId, assetId) => removeAsset(activeUnit.id, assetId, itemId)}
          />
        ) : null}

        {screen === "review" ? (
          <ReviewScreen
            draft={draft}
            stats={stats}
            onBack={() => setScreen("collect")}
            onExport={exportDraft}
            onSubmit={submitDraft}
          />
        ) : null}

        {screen === "success" ? (
          <SuccessScreen onBack={() => setScreen("collect")} onExport={exportDraft} />
        ) : null}
      </main>
    </div>
  );
}

export default App;
