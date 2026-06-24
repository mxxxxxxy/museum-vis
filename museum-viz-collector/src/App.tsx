import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { StageNav } from "./components/StageNav";
import { ENTERED_KEY, SHOW_EXPORT_DATA_PACKAGE_ACTIONS, STORAGE_KEY } from "./constants";
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
  fetchCurrentServerDraft,
  getDraftUserIdentity,
  getDraftUserName,
  getDraftUserPhone,
  openServerSession,
  saveDraftToServer,
  submitDraftToServer,
  transcribeAudio,
  uploadAssetToServer,
  uploadLocalAssetToServer,
} from "./lib/serverStorage";
import { CollectScreen } from "./screens/CollectScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { ItemScreen } from "./screens/ItemScreen";
import { ReviewScreen, type ReviewTarget } from "./screens/ReviewScreen";
import { SuccessScreen } from "./screens/SuccessScreen";
import { UnitScreen } from "./screens/UnitScreen";
import type { AssetRole, MediaAsset, Screen, SubmissionInfo, Unit, VizItem } from "./types";

// 同设备恢复：上次已点过“数据收集”、且本地草稿里必填信息仍齐全时，
// 刷新后直接回到采集流程，而不是被打回锁定的首页。
function loadPersistedEntered(): boolean {
  try {
    if (window.localStorage.getItem(ENTERED_KEY) !== "1") return false;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const restored = normalizeDraft(JSON.parse(saved));
    return getRequiredInfoMissing(restored.info).length === 0;
  } catch {
    return false;
  }
}

function App() {
  const [draft, setDraft] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeDraft(JSON.parse(saved)) : createDraft();
    } catch {
      return createDraft();
    }
  });
  const [screen, setScreen] = useState<Screen>(() => (loadPersistedEntered() ? "collect" : "intro"));
  // 是否已点过“数据收集”正式进入采集：在此之前顶部“采集/检查”一律锁住，
  // 进入采集流程的入口只有首页的“数据收集”按钮这一个。同设备刷新时从本地恢复（见 loadPersistedEntered）。
  const [enteredCollect, setEnteredCollect] = useState(loadPersistedEntered);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<Unit | null>(null);
  const [pendingItem, setPendingItem] = useState<{ unitId: string; item: VizItem } | null>(null);
  const [notice, setNotice] = useState("");
  const serverSessionUserRef = useRef("");
  const pendingServerSessionIdentityRef = useRef("");
  const pendingServerSessionPromiseRef = useRef<Promise<boolean> | null>(null);
  const probeTimerRef = useRef<number | null>(null);
  const probedIdentityRef = useRef("");

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

  // 服务器建档（“建人”）推迟到收集人填完首页必填信息、点击“数据收集”进入采集流程时再做，
  // 见 ensureServerSession()。在此之前只写本地草稿，避免随手输入姓名就在后端生成一条记录。

  // 本地草稿持续写入 localStorage（含 dataUrl），这是刷新/崩溃后的恢复来源。
  // 服务器侧不再每次改动都全量 PUT；改为进入“检查”时存一个粗粒度检查点（见 reviewFromTop），
  // 提交时由 submit 落盘整包，避免高频自动保存带来的无谓负载。
  useEffect(() => {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    } catch {
      setNotice(
        SHOW_EXPORT_DATA_PACKAGE_ACTIONS
          ? "本地草稿空间不足。请先导出当前数据包，或删除部分照片后继续采集。"
          : "本地草稿空间不足。请删除部分照片后继续采集。",
      );
    }
  }, [draft]);

  // 持久化“是否已进入采集”，以便同设备刷新后恢复到采集流程。
  useEffect(() => {
    try {
      window.localStorage.setItem(ENTERED_KEY, enteredCollect ? "1" : "");
    } catch {
      // localStorage 不可用时忽略；下次刷新退回首页，内容不受影响。
    }
  }, [enteredCollect]);

  // 同设备刷新恢复：上次已进入采集时，把会话直接标记为已开（后端按身份无状态接收写入），
  // 不再走一次 openServerSession——避免用可能更旧的服务器草稿覆盖掉本地最新内容。
  useEffect(() => {
    if (!enteredCollect) return;
    const identity = getDraftUserIdentity(draft);
    if (identity) serverSessionUserRef.current = identity;
    // 仅在挂载时执行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 跨设备/换浏览器恢复：身份（姓名+手机号）一就绪、且本会话尚未开档时，
  // 只读探一次服务器是否已有该身份的草稿（GET /submissions/current，不建档、不写盘）。
  // 命中且有内容则直接用服务器记录覆盖本地（不提示用户），把上次填写整包拉回来。
  useEffect(() => {
    if (probeTimerRef.current) window.clearTimeout(probeTimerRef.current);
    const identity = getDraftUserIdentity(draft);
    if (
      !identity ||
      serverSessionUserRef.current === identity ||
      probedIdentityRef.current === identity
    ) {
      return;
    }
    const name = getDraftUserName(draft);
    const phone = getDraftUserPhone(draft);
    probeTimerRef.current = window.setTimeout(() => {
      probedIdentityRef.current = identity;
      fetchCurrentServerDraft(name, phone)
        .then((serverDraft) => {
          if (!serverDraft) return;
          // 此刻用户可能已点了“数据收集”开档，则不再覆盖。
          if (serverSessionUserRef.current === identity) return;
          const normalized = normalizeDraft(serverDraft);
          if (!draftHasContent(normalized)) return;
          // 直接用服务器上的上次记录覆盖本地，无需用户确认。
          setDraft(normalized);
        })
        .catch(() => {
          // 探测失败静默处理，不打扰正在填写的用户。
        });
    }, 600);
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
        submitterPhone: serverDraft.info.submitterPhone || localDraft.info.submitterPhone,
      },
    });
  }

  function draftHasContent(target: typeof draft) {
    const hasInfo = Object.entries(target.info).some(
      ([key, value]) =>
        key !== "submitterName" && key !== "submitterPhone" && value.trim().length > 0,
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
      userPhone: getDraftUserPhone(draft),
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
    const userPhone = getDraftUserPhone(draft);
    const userIdentity = getDraftUserIdentity(draft);
    // 还没点“数据收集”开档前（首页阶段），媒体只在本地暂存（dataUrl），
    // 等点“数据收集”时由 ensureServerSession 统一补传，避免提前在后端建目录。
    if (!userIdentity || serverSessionUserRef.current !== userIdentity) {
      return filesToAssets(files, role, label);
    }

    try {
      const assets = await Promise.all(
        Array.from(files).map((file) =>
          uploadAssetToServer({
            userName,
            userPhone,
            file,
            role,
            label,
            unitId,
            itemId,
          }),
        ),
      );
      return assets;
    } catch {
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

  async function ensureServerSession(): Promise<boolean> {
    const userIdentity = getDraftUserIdentity(draft);
    if (!userIdentity) return false;
    if (serverSessionUserRef.current === userIdentity) return true;
    if (getRequiredInfoMissing(draft.info).length > 0) return false;
    if (
      pendingServerSessionPromiseRef.current &&
      pendingServerSessionIdentityRef.current === userIdentity
    ) {
      return pendingServerSessionPromiseRef.current;
    }

    pendingServerSessionIdentityRef.current = userIdentity;
    pendingServerSessionPromiseRef.current = (async () => {
      // 首页在“数据收集”之前上传的展览平面图是本地暂存（dataUrl）。必须先补传到服务器换成
      // 带 url 的资产再开档，否则 openServerSession 里的 stripInlineMedia 会丢掉 dataUrl、图就没了。
      let draftToOpen = draft;
      if (draft.floorplanAssets.some((asset) => asset.dataUrl && !asset.url)) {
        try {
          const floorplanAssets = await Promise.all(
            draft.floorplanAssets.map((asset) =>
              asset.dataUrl && !asset.url ? uploadLocalAssetToServer(asset, draft) : asset,
            ),
          );
          draftToOpen = { ...draft, floorplanAssets };
          setDraft((current) => ({ ...current, floorplanAssets }));
        } catch {
          setNotice("展览平面图上传服务器失败，已暂存在本地草稿。请稍后重新点击“数据收集”。");
          return false;
        }
      }

      try {
        const { draft: serverDraft } = await openServerSession(draftToOpen);
        serverSessionUserRef.current = userIdentity;
        setDraft((current) => reconcileServerDraft(current, normalizeDraft(serverDraft)));
        return true;
      } catch {
        return false;
      } finally {
        pendingServerSessionIdentityRef.current = "";
        pendingServerSessionPromiseRef.current = null;
      }
    })();
    return pendingServerSessionPromiseRef.current;
  }

  async function continueFromInfo() {
    if (missingInfo.length > 0) return;
    const ready = await ensureServerSession();
    if (!ready) {
      setNotice("无法连接服务器开档，当前内容已保存在本地草稿，请检查网络后重试。");
      return;
    }
    setEnteredCollect(true);
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

  async function collectFromTop() {
    if (missingInfo.length > 0) return;
    const ready = await ensureServerSession();
    if (!ready) {
      setNotice("无法连接服务器开档，当前内容已保存在本地草稿，请稍后重试。");
      return;
    }
    navigateFromTop("collect");
  }

  async function reviewFromTop() {
    if (missingInfo.length > 0) return;
    const ready = await ensureServerSession();
    if (!ready) {
      setNotice("无法连接服务器开档，当前内容已保存在本地草稿，请稍后重试。");
      return;
    }
    // 进入“检查”时存一个粗粒度服务器检查点（取代每次改动的全量自动保存）。
    saveDraftToServer(draft).catch(() => {
      setNotice("进入检查前的服务器保存失败，当前内容已保存在本地草稿。");
    });
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
      // submit 自身会把整包 draft 落盘（status=submitted），无需再单独 saveDraftToServer。
      await submitDraftToServer(draft);
      setNotice("");
      setScreen("success");
    } catch {
      setNotice(
        SHOW_EXPORT_DATA_PACKAGE_ACTIONS
          ? "提交保存到服务器失败，当前内容已保存在本地草稿；如需本地备份，可以单独导出数据包。"
          : "提交保存到服务器失败，当前内容已保存在本地草稿。请检查网络后重试。",
      );
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
          canCollect={enteredCollect}
          canReview={enteredCollect}
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
            showExportActions={SHOW_EXPORT_DATA_PACKAGE_ACTIONS}
            onSubmit={submitDraft}
          />
        ) : null}

        {screen === "success" ? (
          <SuccessScreen
            onBack={() => setScreen("collect")}
            onExport={exportDraft}
            showExportActions={SHOW_EXPORT_DATA_PACKAGE_ACTIONS}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
