import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileImage,
  Home,
  Layers,
  MapPinned,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { ChangeEvent, Fragment, useEffect, useMemo, useState } from "react";

type Screen = "intro" | "info" | "collect" | "unit" | "item" | "review" | "success";
type AssetRole = "environment" | "floorplan" | "photo";

type SubmissionInfo = {
  submitterName: string;
  submitterOrg: string;
  submitterContact: string;
  visitDate: string;
  city: string;
  museumName: string;
  museumAddress: string;
  exhibitionName: string;
  exhibitionPeriod: string;
  exhibitionLink: string;
  exhibitionIntro: string;
};

type MediaAsset = {
  id: string;
  role: AssetRole;
  label: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  createdAt: string;
};

type VizItem = {
  id: string;
  serial: string;
  title: string;
  locationDescription: string;
  description: string;
  visualizationTypes: string[];
  mediaTypes: string[];
  photos: MediaAsset[];
};

type Unit = {
  id: string;
  serial: string;
  name: string;
  description: string;
  environmentAssets: MediaAsset[];
  items: VizItem[];
};

type Draft = {
  id: string;
  createdAt: string;
  updatedAt: string;
  info: SubmissionInfo;
  units: Unit[];
};

type TagKey = "visualizationTypes" | "mediaTypes";

const STORAGE_KEY = "museum-viz-collector-draft-v2";

const emptyInfo: SubmissionInfo = {
  submitterName: "",
  submitterOrg: "",
  submitterContact: "",
  visitDate: new Date().toISOString().slice(0, 10),
  city: "",
  museumName: "",
  museumAddress: "",
  exhibitionName: "",
  exhibitionPeriod: "",
  exhibitionLink: "",
  exhibitionIntro: "",
};

const visualizationTypeOptions = [
  "地图",
  "时间线",
  "柱状图",
  "饼图",
  "流程图",
  "关系图",
  "信息图",
  "数据墙",
  "互动屏",
  "实体装置",
  "其他",
];

const mediaTypeOptions = [
  "墙面印刷",
  "立体展板",
  "屏幕",
  "投影",
  "灯箱",
  "展柜",
  "复合媒介",
  "其他",
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function createUnit(index = 1): Unit {
  return {
    id: uid("unit"),
    serial: `单元${index}`,
    name: "",
    description: "",
    environmentAssets: [],
    items: [],
  };
}

function createItem(unitSerial: string, index: number): VizItem {
  return {
    id: uid("item"),
    serial: `${unitSerial}-V${pad2(index)}`,
    title: "",
    locationDescription: "",
    description: "",
    visualizationTypes: [],
    mediaTypes: [],
    photos: [],
  };
}

function renumberItems(unitSerial: string, items: VizItem[] = []): VizItem[] {
  return items.map((item, index) => ({
    ...item,
    serial: `${unitSerial}-V${pad2(index + 1)}`,
  }));
}

function normalizeAsset(asset: Partial<MediaAsset> | undefined, fallbackRole: AssetRole): MediaAsset {
  return {
    id: asset?.id ?? uid("asset"),
    role: asset?.role ?? fallbackRole,
    label: asset?.label ?? "照片",
    name: asset?.name ?? "photo.jpg",
    type: asset?.type ?? "image/jpeg",
    size: asset?.size ?? 0,
    dataUrl: asset?.dataUrl ?? "",
    createdAt: asset?.createdAt ?? new Date().toISOString(),
  };
}

function normalizeItem(item: Partial<VizItem> & { notes?: string }): VizItem {
  return {
    id: item.id ?? uid("item"),
    serial: item.serial ?? "",
    title: item.title ?? "",
    locationDescription: item.locationDescription ?? "",
    description: item.description ?? item.notes ?? "",
    visualizationTypes: item.visualizationTypes ?? [],
    mediaTypes: item.mediaTypes ?? [],
    photos: (item.photos ?? []).map((asset) => normalizeAsset(asset, "photo")),
  };
}

function normalizeUnits(
  units: Array<Partial<Unit> & { locationDescription?: string; notes?: string }> = [],
): Unit[] {
  return units.map((unit, index) => {
    const serial = `单元${index + 1}`;
    const description =
      unit.description ??
      [unit.locationDescription, unit.notes]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join("\n");
    return {
      id: unit.id ?? uid("unit"),
      serial,
      name: unit.name ?? "",
      description,
      environmentAssets: (unit.environmentAssets ?? []).map((asset) =>
        normalizeAsset(asset, "environment"),
      ),
      items: renumberItems(serial, (unit.items ?? []).map((item) => normalizeItem(item))),
    };
  });
}

function normalizeDraft(draft: Partial<Draft>): Draft {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? `SUB-${Date.now().toString(36).toUpperCase()}`,
    createdAt: draft.createdAt ?? now,
    updatedAt: draft.updatedAt ?? now,
    info: { ...emptyInfo, ...(draft.info ?? {}) },
    units: normalizeUnits(draft.units ?? []),
  };
}

function createDraft(): Draft {
  return normalizeDraft({});
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      type,
      quality,
    );
  });
}

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();

    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale >= 1 && file.size < 1_200_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function filesToAssets(
  files: FileList | File[],
  role: AssetRole,
  label: string,
): Promise<MediaAsset[]> {
  return Promise.all(
    Array.from(files).map(async (sourceFile) => {
      const file = await compressImageFile(sourceFile);
      return {
        id: uid("asset"),
        role,
        label,
        name: file.name || `${label}.jpg`,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
        createdAt: new Date().toISOString(),
      };
    }),
  );
}

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function getRequiredInfoMissing(info: SubmissionInfo) {
  const fields: Array<[keyof SubmissionInfo, string]> = [
    ["submitterName", "收集人姓名"],
    ["submitterOrg", "收集人单位"],
    ["visitDate", "调研时间"],
    ["city", "所在城市"],
    ["museumName", "博物馆名称"],
    ["museumAddress", "博物馆地址"],
    ["exhibitionName", "展览名称"],
  ];
  return fields.filter(([key]) => !info[key].trim()).map(([, label]) => label);
}

function countAssets(draft: Draft) {
  return draft.units.reduce(
    (acc, unit) => {
      acc.units += 1;
      acc.assets += unit.environmentAssets.length;
      unit.items.forEach((item) => {
        acc.items += 1;
        acc.assets += item.photos.length;
      });
      return acc;
    },
    { units: 0, items: 0, assets: 0 },
  );
}

function App() {
  const [draft, setDraft] = useState<Draft>(() => {
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
    const item = createItem(unit.serial, unit.items.length + 1);
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
              items: renumberItems(
                unit.serial,
                unit.items.filter((item) => item.id !== itemId),
              ),
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

function IntroScreen({
  hasBasicInfo,
  hasCollectionProgress,
  onStart,
  onContinue,
}: {
  hasBasicInfo: boolean;
  hasCollectionProgress: boolean;
  onStart: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="screen intro-screen">
      <div className="intro-panel">
        <h2>记录博物馆里的可视化，以及它所在的展陈环境</h2>
        <p>
          这个工具用于在现场快速采集展览里的地图、时间线、数据墙、互动屏等可视化，并记录它们所在区域的环境。整套数据按「展览 → 展览单元 → 可视化项」三层组织，最后打包上传。
        </p>
        <div className="intro-actions">
          <button className="primary-button" type="button" onClick={onStart}>
            {hasBasicInfo ? "查看 / 继续基础信息" : "开始填写基础信息"}
            <ChevronRight size={18} />
          </button>
          {hasCollectionProgress ? (
            <button className="secondary-button" type="button" onClick={onContinue}>
              继续采集
            </button>
          ) : null}
        </div>
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

    </section>
  );
}

function InfoScreen({
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

function CollectScreen({
  draft,
  stats,
  onAddUnit,
  onOpenUnit,
  onAddItem,
  onOpenItem,
  onRemoveItem,
}: {
  draft: Draft;
  stats: ReturnType<typeof countAssets>;
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
          <div className="drawer-title">可视化项</div>
          {unit.items.length === 0 ? (
            <p className="drawer-empty">这个单元还没有可视化项。</p>
          ) : (
            <ul className="viz-item-list">
              {unit.items.map((item) => (
                <li key={item.id}>
                  <button
                    className="viz-item-row"
                    type="button"
                    onClick={() => onOpenItem(item.id)}
                  >
                    <span className="viz-serial">{item.serial}</span>
                    <span className="viz-title">{item.title || "未命名可视化项"}</span>
                    <ChevronRight size={16} />
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

function UnitScreen({
  unit,
  onBack,
  onPatchUnit,
  onRemoveUnit,
  onAddUnitFiles,
  onRemoveUnitAsset,
}: {
  unit: Unit;
  onBack: () => void;
  onPatchUnit: (patch: Partial<Unit>) => void;
  onRemoveUnit: () => void;
  onAddUnitFiles: (event: ChangeEvent<HTMLInputElement>, role: AssetRole, label: string) => void;
  onRemoveUnitAsset: (assetId: string) => void;
}) {
  return (
    <section className="screen session-screen">
      <ScreenTop
        title={`${unit.serial} · ${unit.name || "未命名单元"}`}
        subtitle="记录这个单元的空间与环境。可视化项在采集页的卡片里添加。"
        onBack={onBack}
      />

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">展览单元</p>
            <h2>空间与环境</h2>
          </div>
          <button className="icon-button danger" type="button" onClick={onRemoveUnit}>
            <Trash2 size={18} />
          </button>
        </div>
        <div className="form-grid compact">
          <TextField
            label="单元名称"
            value={unit.name}
            required
            placeholder="例如：序幕厅、今日北大展厅"
            className="field-wide"
            onChange={(value) => onPatchUnit({ name: value })}
          />
          {!unit.name.trim() ? (
            <div className="soft-warning field-wide">
              单元名称为必填，请先填写，方便后续识别和整理。
            </div>
          ) : null}
          <label className="field field-wide">
            <span>单元描述</span>
            <textarea
              value={unit.description}
              placeholder="可以从两方面描述：① 位置——它在展览中的位置（如首层东侧、入口右手边、主展线中段）；② 环境——人流、灯光、遮挡、展线方向等。"
              onChange={(event) => onPatchUnit({ description: event.target.value })}
            />
          </label>
        </div>

        <div className="upload-grid">
          <MediaInputGroup
            icon={<Camera size={18} />}
            cameraLabel="拍环境照"
            libraryLabel="选环境照"
            onChange={(event) => onAddUnitFiles(event, "environment", "环境照")}
          />
        </div>
        <MediaGrid assets={unit.environmentAssets} onRemove={onRemoveUnitAsset} />
      </div>
    </section>
  );
}

function ItemScreen({
  unit,
  activeItemId,
  onBack,
  onPatchItem,
  onToggleTag,
  onAddItemFiles,
  onRemoveItemAsset,
}: {
  unit: Unit;
  activeItemId: string | null;
  onBack: () => void;
  onPatchItem: (itemId: string, patch: Partial<VizItem>) => void;
  onToggleTag: (itemId: string, key: TagKey, value: string) => void;
  onAddItemFiles: (event: ChangeEvent<HTMLInputElement>, itemId: string, label: string) => void;
  onRemoveItemAsset: (itemId: string, assetId: string) => void;
}) {
  const activeItem = unit.items.find((item) => item.id === activeItemId) ?? unit.items[0];
  return (
    <section className="screen session-screen">
      <ScreenTop
        title={`${unit.serial} · 可视化项`}
        subtitle={unit.name ? `所属单元：${unit.name}` : "记录照片 + 文字描述 + 类型。"}
        onBack={onBack}
      />

      <div className="panel">
        {activeItem ? (
          <ItemEditor
            item={activeItem}
            onPatch={(patch) => onPatchItem(activeItem.id, patch)}
            onToggleTag={(key, value) => onToggleTag(activeItem.id, key, value)}
            onAddFiles={(event, label) => onAddItemFiles(event, activeItem.id, label)}
            onRemoveAsset={(assetId) => onRemoveItemAsset(activeItem.id, assetId)}
          />
        ) : (
          <EmptyState
            icon={<FileImage size={34} />}
            title="可视化项不存在"
            text="它可能已被删除，请返回采集页重新选择或添加。"
          />
        )}
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  onPatch,
  onToggleTag,
  onAddFiles,
  onRemoveAsset,
}: {
  item: VizItem;
  onPatch: (patch: Partial<VizItem>) => void;
  onToggleTag: (key: TagKey, value: string) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>, label: string) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  return (
    <div className="item-editor">
      <div className="form-grid compact">
        <TextField
          label="名称"
          value={item.title}
          placeholder="例如：北大百年校史时间线"
          onChange={(value) => onPatch({ title: value })}
        />
        <TextField
          label="位置"
          value={item.locationDescription}
          placeholder="可选，如入口右侧墙面、展柜旁。"
          onChange={(value) => onPatch({ locationDescription: value })}
        />
      </div>

      <div className="field-block">
        <div className="block-title">
          <h4>现场照片</h4>
          <p>建议拍三类：环境位置、正面完整、关键细节。</p>
        </div>
        <div className="upload-grid">
          <MediaInputGroup
            icon={<Camera size={18} />}
            cameraLabel="拍照"
            libraryLabel="从相册选"
            onChange={(event) => onAddFiles(event, "现场照片")}
          />
        </div>
        <MediaGrid
          assets={item.photos}
          emptyText="还没有照片。点上面的「拍照」或「从相册选」添加现场照片。"
          onRemove={onRemoveAsset}
        />
      </div>

      <label className="field field-wide field-emphasis">
        <span>
          文字描述
          <b>重点</b>
        </span>
        <textarea
          value={item.description}
          placeholder="写一段描述：它画了什么？有哪些主要部分？主要在讲什么信息？在展览里起什么作用？好不好懂？"
          onChange={(event) => onPatch({ description: event.target.value })}
        />
      </label>

      <ChoiceBlock
        title="可视化类型"
        values={item.visualizationTypes}
        options={visualizationTypeOptions}
        onToggle={(value) => onToggleTag("visualizationTypes", value)}
      />
      <ChoiceBlock
        title="展陈媒介"
        values={item.mediaTypes}
        options={mediaTypeOptions}
        onToggle={(value) => onToggleTag("mediaTypes", value)}
      />
    </div>
  );
}

function ReviewScreen({
  draft,
  stats,
  onBack,
  onExport,
  onSubmit,
}: {
  draft: Draft;
  stats: ReturnType<typeof countAssets>;
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

function SuccessScreen({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  return (
    <section className="screen">
      <div className="success-panel">
        <div className="hero-icon">
          <Check size={32} />
        </div>
        <h2>提交包已导出</h2>
        <p>
          当前原型会把结构化信息和照片一起导出。正式版可以把同一套结构接入后端对象存储，实现真正的上传。
        </p>
        <div className="action-row center">
          <button className="secondary-button" type="button" onClick={onBack}>
            继续采集
          </button>
          <button className="primary-button" type="button" onClick={onExport}>
            <Download size={18} />
            再次导出
          </button>
        </div>
      </div>
    </section>
  );
}

function StageNav({
  screen,
  onHome,
  onCollect,
  onReview,
}: {
  screen: Screen;
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
      >
        <MapPinned size={18} />
        <span>2 采集</span>
      </button>
      <button className={screen === "review" ? "active" : ""} type="button" onClick={onReview}>
        <ClipboardList size={18} />
        <span>3 检查</span>
      </button>
    </nav>
  );
}

function ScreenTop({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <div className="screen-top">
      <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
        <ArrowLeft size={20} />
      </button>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`field${className ? ` ${className}` : ""}`}>
      <span>
        {label}
        {required ? <b>必填</b> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function MediaInputGroup({
  icon,
  cameraLabel,
  libraryLabel,
  onChange,
}: {
  icon: React.ReactNode;
  cameraLabel: string;
  libraryLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="media-input-group">
      <CaptureButton
        icon={icon}
        label={cameraLabel}
        accept="image/*"
        capture="environment"
        onChange={onChange}
      />
      <CaptureButton
        icon={<Upload size={18} />}
        label={libraryLabel}
        accept="image/*"
        multiple
        onChange={onChange}
      />
    </div>
  );
}

function CaptureButton({
  icon,
  label,
  accept,
  capture,
  multiple,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="capture-button">
      {icon}
      <span>{label}</span>
      <input type="file" accept={accept} capture={capture} multiple={multiple} onChange={onChange} />
    </label>
  );
}

function MediaGrid({
  assets,
  emptyText,
  onRemove,
}: {
  assets: MediaAsset[];
  emptyText?: string;
  onRemove: (assetId: string) => void;
}) {
  if (!assets.length) return emptyText ? <div className="empty-media">{emptyText}</div> : null;
  return (
    <div className="media-grid">
      {assets.map((asset) => (
        <div className="media-tile" key={asset.id}>
          <img src={asset.dataUrl} alt={asset.label} />
          <div className="media-meta">
            <strong>{asset.label}</strong>
            <span>{formatBytes(asset.size)}</span>
          </div>
          <button
            className="remove-media"
            type="button"
            onClick={() => onRemove(asset.id)}
            aria-label="删除照片"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ChoiceBlock({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="choice-block">
      <div className="block-title">
        <h4>{title}</h4>
      </div>
      <div className="chip-grid">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={values.includes(option) ? "chip selected" : "chip"}
            onClick={() => onToggle(option)}
          >
            {values.includes(option) ? <Check size={15} /> : null}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export default App;
