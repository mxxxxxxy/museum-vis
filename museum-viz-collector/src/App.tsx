import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { StageNav } from "./components/StageNav";
import { STORAGE_KEY } from "./constants";
import {
  countAssets,
  createDraft,
  createItem,
  createUnit,
  getItemMissingFields,
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
  transcribeAudio,
  uploadAssetToServer,
} from "./lib/serverStorage";
import { CollectScreen } from "./screens/CollectScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { ItemScreen } from "./screens/ItemScreen";
import { ReviewScreen, type ReviewTarget } from "./screens/ReviewScreen";
import { SuccessScreen } from "./screens/SuccessScreen";
import { UnitScreen } from "./screens/UnitScreen";
import type { AssetRole, MediaAsset, Screen, SubmissionInfo, Unit, VizItem } from "./types";

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
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [pendingItem, setPendingItem] = useState<{ unitId: string; item: VizItem } | null>(null);
  const [notice, setNotice] = useState("");
  const [, setStorageLabel] = useState("本地草稿");
  const sessionTimerRef = useRef<number | null>(null);
  const serverSessionUserRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);

  const activeUnit = useMemo(
    () => {
      if (pendingUnit?.id === activeUnitId) return pendingUnit;
      const unit = draft.units.find((candidate) => candidate.id === activeUnitId) ?? null;
      if (!unit || pendingItem?.unitId !== unit.id) return unit;
      return { ...unit, items: [...unit.items, pendingItem.item] };
    },
    [draft.units, activeUnitId, pendingItem, pendingUnit],
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
    return hasInfo || target.floorplanAssets.length > 0 || target.units.length > 0;
  }

  function patchInfo(key: keyof SubmissionInfo, value: string) {
    setDraft((current) => ({
      ...current,
      info: { ...current.info, [key]: value },
    }));
  }

  async function addFloorplanFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files?.length) return;
    const assets = await createAssetsFromFiles(event.target.files, "floorplan", "展览平面图");
    setDraft((current) => ({
      ...current,
      floorplanAssets: [...current.floorplanAssets, ...assets],
    }));
    event.target.value = "";
  }

  function removeFloorplanAsset(assetId: string) {
    const asset = draft.floorplanAssets.find((candidate) => candidate.id === assetId);
    if (asset) {
      deleteAssetFromServer(draft, asset).catch(() => {
        setNotice("服务器上的展览平面图删除失败，本地草稿已先移除。");
      });
    }
    setDraft((current) => ({
      ...current,
      floorplanAssets: current.floorplanAssets.filter((candidate) => candidate.id !== assetId),
    }));
  }

  function addUnit() {
    const unit = createUnit(draft.units.length + 1);
    setPendingUnit(unit);
    setActiveUnitId(unit.id);
    setActiveItemId(null);
    setScreen("unit");
  }

  function patchUnit(unitId: string, patch: Partial<Unit>) {
    if (pendingUnit?.id === unitId) {
      setPendingUnit((current) => (current?.id === unitId ? { ...current, ...patch } : current));
      return;
    }

    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit)),
    }));
  }

  function confirmUnit() {
    if (!activeUnit || !activeUnit.name.trim() || !activeUnit.description.trim()) {
      setNotice("");
      return;
    }

    if (pendingUnit?.id === activeUnit.id) {
      setDraft((current) => ({
        ...current,
        units: normalizeUnits([...current.units, activeUnit]),
      }));
      setPendingUnit(null);
      setActiveUnitId(activeUnit.id);
    }

    setNotice("");
    setScreen("collect");
  }

  function returnFromUnit() {
    if (pendingUnit?.id === activeUnitId) {
      discardPendingUnit();
      setActiveUnitId(null);
      setActiveItemId(null);
    }
    setNotice("");
    setScreen("collect");
  }

  function discardPendingUnit() {
    if (!pendingUnit) return;
    pendingUnit.environmentAssets.forEach((asset) => {
      deleteAssetFromServer(draft, asset).catch(() => {
        setNotice("服务器上的临时环境照片删除失败，本地草稿已先取消这个展览单元。");
      });
    });
    setPendingUnit(null);
  }

  function removeUnit(unitId: string) {
    if (pendingUnit?.id === unitId) {
      returnFromUnit();
      return;
    }

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
    setPendingItem({ unitId, item });
    setActiveUnitId(unitId);
    setActiveItemId(item.id);
    setScreen("item");
  }

  function patchItem(unitId: string, itemId: string, patch: Partial<VizItem>) {
    if (pendingItem?.unitId === unitId && pendingItem.item.id === itemId) {
      setPendingItem((current) =>
        current?.unitId === unitId && current.item.id === itemId
          ? { ...current, item: { ...current.item, ...patch } }
          : current,
      );
      return;
    }

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

  function confirmItem() {
    const item = findItem(activeUnitId, activeItemId);
    if (!item || !activeUnitId || !activeItemId) return;

    const missingFields = getItemMissingFields(item);
    if (missingFields.length > 0) {
      setNotice("");
      return;
    }

    if (pendingItem?.unitId === activeUnitId && pendingItem.item.id === activeItemId) {
      setDraft((current) => ({
        ...current,
        units: current.units.map((unit) =>
          unit.id === activeUnitId
            ? { ...unit, items: renumberItems([...unit.items, item]) }
            : unit,
        ),
      }));
      setPendingItem(null);
    }

    setNotice("");
    setScreen("collect");
  }

  function discardPendingItem() {
    if (!pendingItem) return;
    pendingItem.item.photos.forEach((asset) => {
      deleteAssetFromServer(draft, asset).catch(() => {
        setNotice("服务器上的临时媒体文件删除失败，本地草稿已先取消这个可视化项。");
      });
    });
    setPendingItem(null);
  }

  function returnFromItem() {
    if (pendingItem?.unitId === activeUnitId && pendingItem.item.id === activeItemId) {
      discardPendingItem();
      setActiveItemId(null);
    }
    setNotice("");
    setScreen("collect");
  }

  async function addUnitFiles(
    event: ChangeEvent<HTMLInputElement>,
    unitId: string,
    role: AssetRole,
    label: string,
  ) {
    if (!event.target.files?.length) return;
    const assets = await createAssetsFromFiles(event.target.files, role, label, unitId);
    if (pendingUnit?.id === unitId) {
      setPendingUnit((current) =>
        current?.id === unitId
          ? { ...current, environmentAssets: [...current.environmentAssets, ...assets] }
          : current,
      );
      event.target.value = "";
      return;
    }

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
    appendItemPhotos(unitId, itemId, assets);
    event.target.value = "";
  }

  async function transcribeItemAudio(
    unitId: string,
    itemId: string,
    section: string,
    blob: Blob,
  ) {
    return transcribeAudio(blob, {
      userName: getDraftUserName(draft),
      unitId,
      itemId,
      section,
    });
  }

  function appendItemPhotos(unitId: string, itemId: string, assets: MediaAsset[]) {
    if (pendingItem?.unitId === unitId && pendingItem.item.id === itemId) {
      setPendingItem((current) =>
        current?.unitId === unitId && current.item.id === itemId
          ? { ...current, item: { ...current.item, photos: [...current.item.photos, ...assets] } }
          : current,
      );
      return;
    }

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
  }

  async function createAssetsFromFiles(
    files: FileList | File[],
    role: AssetRole,
    label: string,
    unitId?: string,
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
    if (!itemId && pendingUnit?.id === unitId) {
      setPendingUnit((current) =>
        current?.id === unitId
          ? {
              ...current,
              environmentAssets: current.environmentAssets.filter(
                (candidate) => candidate.id !== assetId,
              ),
            }
          : current,
      );
      return;
    }

    if (pendingItem?.unitId === unitId && pendingItem.item.id === itemId) {
      setPendingItem((current) =>
        current?.unitId === unitId && current.item.id === itemId
          ? {
              ...current,
              item: {
                ...current.item,
                photos: current.item.photos.filter((candidate) => candidate.id !== assetId),
              },
            }
          : current,
      );
      return;
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
    if (!itemId && pendingUnit?.id === unitId) {
      return pendingUnit.environmentAssets.find((asset) => asset.id === assetId) ?? null;
    }

    if (pendingItem?.unitId === unitId && pendingItem.item.id === itemId) {
      return pendingItem.item.photos.find((asset) => asset.id === assetId) ?? null;
    }

    const unit = draft.units.find((candidate) => candidate.id === unitId);
    if (!unit) return null;
    if (!itemId) {
      return unit.environmentAssets.find((asset) => asset.id === assetId) ?? null;
    }
    return unit.items
      .find((item) => item.id === itemId)
      ?.photos.find((asset) => asset.id === assetId) ?? null;
  }

  function findItem(unitId: string | null, itemId: string | null): VizItem | null {
    if (!unitId || !itemId) return null;
    if (pendingItem?.unitId === unitId && pendingItem.item.id === itemId) {
      return pendingItem.item;
    }
    return (
      draft.units
        .find((candidate) => candidate.id === unitId)
        ?.items.find((candidate) => candidate.id === itemId) ?? null
    );
  }

  function continueFromInfo() {
    if (missingInfo.length > 0) return;
    setNotice("");
    setScreen("collect");
  }

  function openUnit(unitId: string) {
    discardPendingUnit();
    discardPendingItem();
    setActiveUnitId(unitId);
    setActiveItemId(null);
    setScreen("unit");
  }

  function openItem(unitId: string, itemId: string) {
    discardPendingItem();
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

  function navigateFromTop(nextScreen: Screen) {
    if (pendingUnit?.id === activeUnitId) {
      discardPendingUnit();
      setActiveUnitId(null);
      setActiveItemId(null);
    }
    if (pendingItem?.unitId === activeUnitId && pendingItem.item.id === activeItemId) {
      discardPendingItem();
      setActiveItemId(null);
    }
    setScreen(nextScreen);
  }

  function collectFromTop() {
    if (missingInfo.length > 0) return;
    navigateFromTop("collect");
  }

  function reviewFromTop() {
    navigateFromTop("review");
  }

  function jumpToReviewTarget(target: ReviewTarget) {
    switch (target.type) {
      case "info":
        navigateFromTop("intro");
        break;
      case "collect":
        if (target.unitId) setActiveUnitId(target.unitId);
        navigateFromTop("collect");
        break;
      case "unit":
        openUnit(target.unitId);
        break;
      case "item":
        openItem(target.unitId, target.itemId);
        break;
    }
  }

  async function submitDraft() {
    try {
      await saveDraftToServer(draft);
      await submitDraftToServer(draft);
      setStorageLabel("服务器草稿");
      setNotice("");
      setScreen("success");
    } catch {
      setNotice("提交保存到服务器失败，当前内容已保存在本地草稿；如需本地备份，可以单独导出数据包。");
    }
  }

  return (
    <div className="app-shell">
      <div className="top-stack">
        <header className="app-header">
          <h1>博物馆展陈可视化调研</h1>
        </header>

        <StageNav
          screen={screen}
          canCollect={missingInfo.length === 0}
          onHome={() => navigateFromTop("intro")}
          onCollect={collectFromTop}
          onReview={reviewFromTop}
        />
      </div>

      <main className="app-main">
        {notice ? <div className="notice">{notice}</div> : null}

        {screen === "intro" ? (
          <IntroScreen
            draft={draft}
            patchInfo={patchInfo}
            onAddFloorplanFiles={addFloorplanFiles}
            onRemoveFloorplanAsset={removeFloorplanAsset}
            onContinue={continueFromInfo}
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
            onBack={returnFromUnit}
            onConfirm={confirmUnit}
            onPatchUnit={(patch) => patchUnit(activeUnit.id, patch)}
            onRemoveUnit={
              pendingUnit?.id === activeUnit.id ? undefined : () => removeUnit(activeUnit.id)
            }
            onAddUnitFiles={(event, role, label) => addUnitFiles(event, activeUnit.id, role, label)}
            onRemoveUnitAsset={(assetId) => removeAsset(activeUnit.id, assetId)}
          />
        ) : null}

        {screen === "item" && activeUnit ? (
          <ItemScreen
            unit={activeUnit}
            activeItemId={activeItemId}
            onBack={returnFromItem}
            onConfirm={confirmItem}
            onPatchItem={(itemId, patch) => patchItem(activeUnit.id, itemId, patch)}
            onAddItemFiles={(event, itemId, label, role) =>
              addItemFiles(event, activeUnit.id, itemId, label, role)
            }
            onTranscribeItemAudio={(itemId, section, blob) =>
              transcribeItemAudio(activeUnit.id, itemId, section, blob)
            }
            onRemoveItemAsset={(itemId, assetId) => removeAsset(activeUnit.id, assetId, itemId)}
          />
        ) : null}

        {screen === "review" ? (
          <ReviewScreen
            draft={draft}
            stats={stats}
            onJumpTo={jumpToReviewTarget}
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
