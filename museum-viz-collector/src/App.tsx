import { Save } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
import {
  deleteAssetFromServer,
  getDraftUserName,
  openServerSession,
  saveDraftToServer,
  submitDraftToServer,
  uploadAssetToServer,
} from "./lib/serverStorage";
import { CollectScreen } from "./screens/CollectScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { ItemScreen } from "./screens/ItemScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SuccessScreen } from "./screens/SuccessScreen";
import { UnitScreen } from "./screens/UnitScreen";
import type { AssetRole, MediaAsset, Screen, SubmissionInfo, TagKey, Unit, VizItem } from "./types";

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
  const [storageLabel, setStorageLabel] = useState("本地草稿");
  const sessionTimerRef = useRef<number | null>(null);
  const serverSessionUserRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);

  const activeUnit = useMemo(
    () => draft.units.find((unit) => unit.id === activeUnitId) ?? null,
    [draft.units, activeUnitId],
  );

  const stats = countAssets(draft);
  const missingInfo = getRequiredInfoMissing(draft.info);

  useEffect(() => {
    const userName = getDraftUserName(draft);
    if (!userName || serverSessionUserRef.current === userName) return;
    if (sessionTimerRef.current) window.clearTimeout(sessionTimerRef.current);

    sessionTimerRef.current = window.setTimeout(() => {
      openServerSession(userName, draft)
        .then(({ draft: serverDraft }) => {
          serverSessionUserRef.current = userName;
          setStorageLabel("服务器草稿");
          const normalizedServerDraft = normalizeDraft(serverDraft);
          setDraft((current) => reconcileServerDraft(current, normalizedServerDraft));
        })
        .catch(() => {
          setStorageLabel("本地草稿");
        });
    }, 300);
  }, [draft.info.submitterName]);

  useEffect(() => {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    } catch {
      setNotice("本地草稿空间不足。请先导出当前数据包，或删除部分照片后继续采集。");
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const userName = getDraftUserName(nextDraft);
    if (!userName) {
      setStorageLabel("本地草稿");
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveDraftToServer(nextDraft)
        .then(() => setStorageLabel("服务器草稿"))
        .catch(() => {
          setStorageLabel("本地草稿");
          setNotice("服务器自动保存失败，当前内容已保存在本地草稿。");
        });
    }, 800);
  }, [draft]);

  function reconcileServerDraft(localDraft: typeof draft, serverDraft: typeof draft) {
    if (draftHasContent(serverDraft)) return serverDraft;
    return normalizeDraft({
      ...localDraft,
      id: serverDraft.id,
      createdAt: serverDraft.createdAt || localDraft.createdAt,
      info: {
        ...localDraft.info,
        submitterName: serverDraft.info.submitterName || localDraft.info.submitterName,
      },
    });
  }

  function draftHasContent(target: typeof draft) {
    const hasInfo = Object.entries(target.info).some(
      ([key, value]) => key !== "submitterName" && value.trim().length > 0,
    );
    return hasInfo || target.units.length > 0;
  }

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
    const assets = await createAssetsFromFiles(event.target.files, role, label, unitId);
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
    role: AssetRole = "photo",
  ) {
    if (!event.target.files?.length) return;
    const assets = await createAssetsFromFiles(event.target.files, role, label, unitId, itemId);
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

  async function createAssetsFromFiles(
    files: FileList,
    role: AssetRole,
    label: string,
    unitId: string,
    itemId?: string,
  ) {
    const userName = getDraftUserName(draft);
    if (!userName) return filesToAssets(files, role, label);

    try {
      const assets = await Promise.all(
        Array.from(files).map((file) =>
          uploadAssetToServer({
            userName,
            file,
            role,
            label,
            unitId,
            itemId,
          }),
        ),
      );
      setStorageLabel("服务器草稿");
      return assets;
    } catch {
      setStorageLabel("本地草稿");
      setNotice("媒体上传到服务器失败，已临时保存在本地草稿。");
      return filesToAssets(files, role, label);
    }
  }

  function removeAsset(unitId: string, assetId: string, itemId?: string) {
    const asset = findAsset(unitId, assetId, itemId);
    if (asset) {
      deleteAssetFromServer(draft, asset).catch(() => {
        setNotice("服务器上的媒体文件删除失败，本地草稿已先移除。");
      });
    }
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

  function findAsset(unitId: string, assetId: string, itemId?: string): MediaAsset | null {
    const unit = draft.units.find((candidate) => candidate.id === unitId);
    if (!unit) return null;
    if (!itemId) {
      return unit.environmentAssets.find((asset) => asset.id === assetId) ?? null;
    }
    return unit.items
      .find((item) => item.id === itemId)
      ?.photos.find((asset) => asset.id === assetId) ?? null;
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
    if (missingInfo.length > 0) return;
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
      note: "媒体文件优先保存在服务器 uploads 目录中，导出数据里记录媒体 URL；服务器不可用时，本地草稿可能保留 dataUrl 作为临时兜底。",
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

  async function submitDraft() {
    try {
      await saveDraftToServer(draft);
      await submitDraftToServer(draft);
      setStorageLabel("服务器草稿");
    } catch {
      setNotice("提交保存到服务器失败，已保留本地草稿并导出数据包。");
    }
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
            <span>{storageLabel}</span>
          </div>
        </header>

        <StageNav
          screen={screen}
          canCollect={missingInfo.length === 0}
          onHome={() => setScreen("intro")}
          onCollect={() => setScreen("collect")}
          onReview={() => setScreen("review")}
        />
      </div>

      <main className="app-main">
        {notice ? <div className="notice">{notice}</div> : null}

        {screen === "intro" ? (
          <IntroScreen
            draft={draft}
            patchInfo={patchInfo}
            onContinue={continueFromInfo}
            onReset={resetDraft}
          />
        ) : null}

        {screen === "collect" ? (
          <CollectScreen
            draft={draft}
            stats={stats}
            autoExpandUnitId={activeUnitId}
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
            onAddItemFiles={(event, itemId, label, role) =>
              addItemFiles(event, activeUnit.id, itemId, label, role)
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
