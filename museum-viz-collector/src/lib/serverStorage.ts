import type { AssetRole, Draft, MediaAsset } from "../types";
import { prepareMediaFile } from "./media";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const apiBaseUrl = (env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiPrefix = "/exhibition_api";

type UploadAssetParams = {
  userName: string;
  userPhone: string;
  file: File;
  role: AssetRole;
  label: string;
  unitId?: string;
  itemId?: string;
};

export function getDraftUserName(draft: Draft) {
  return draft.info.submitterName.trim();
}

export function getDraftUserPhone(draft: Draft) {
  return draft.info.submitterPhone.replace(/\D/g, "").slice(0, 32);
}

export function getDraftUserIdentity(draft: Draft) {
  const userName = getDraftUserName(draft);
  const userPhone = getDraftUserPhone(draft);
  return userName && userPhone ? `${userName}\n${userPhone}` : "";
}

function identityPayload(draft: Draft) {
  return {
    userName: getDraftUserName(draft),
    userPhone: getDraftUserPhone(draft),
  };
}

// 只读查档：按身份（姓名+手机号）查服务器上是否已有该用户的草稿。
// 用 GET /submissions/current，后端只读 draft.json、不建目录、不写盘，
// 因此可以在用户还没点“数据收集”、只填了姓名+手机号时就提前探一次是否有旧记录，
// 不破坏“建档推迟到数据收集”的约束。没有记录时返回 null。
export async function fetchCurrentServerDraft(
  userName: string,
  userPhone: string,
): Promise<Draft | null> {
  const name = userName.trim();
  const phone = userPhone.replace(/\D/g, "").slice(0, 32);
  if (!name || !phone) return null;
  const query = new URLSearchParams({ userName: name, userPhone: phone });
  const { draft } = await requestJson<{ draft: Draft | null }>(
    `${apiPrefix}/submissions/current?${query.toString()}`,
    { method: "GET" },
  );
  return draft ?? null;
}

export async function openServerSession(draft: Draft) {
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identityPayload(draft), draft: stripInlineMedia(draft) }),
    },
  );
}

export async function saveDraftToServer(draft: Draft) {
  if (!getDraftUserIdentity(draft)) return null;
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identityPayload(draft), draft: stripInlineMedia(draft) }),
    },
  );
}

export async function submitDraftToServer(draft: Draft) {
  if (!getDraftUserIdentity(draft)) return null;
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identityPayload(draft), draft: stripInlineMedia(draft) }),
    },
  );
}

export async function uploadAssetToServer({
  userName,
  userPhone,
  file,
  role,
  label,
  unitId,
  itemId,
}: UploadAssetParams): Promise<MediaAsset> {
  const preparedFile = await prepareMediaFile(file);
  const formData = new FormData();
  formData.set("userName", userName);
  formData.set("userPhone", userPhone);
  formData.set("role", role);
  formData.set("label", label);
  if (unitId) formData.set("unitId", unitId);
  if (itemId) formData.set("itemId", itemId);
  formData.set("file", preparedFile);

  const response = await fetch(apiPath(`${apiPrefix}/assets`), {
    method: "POST",
    body: formData,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "上传失败");
  }
  return {
    id: payload.asset.id,
    role: payload.asset.role,
    label: payload.asset.label,
    name: payload.asset.name,
    originalName: payload.asset.originalName,
    type: payload.asset.type,
    size: payload.asset.size,
    url: payload.asset.url,
    createdAt: payload.asset.createdAt,
  };
}

async function dataUrlToFile(dataUrl: string, fileName: string, type: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: type || blob.type });
}

// 把本地暂存（dataUrl）的资产补传到服务器，返回带 url 的服务器资产；没有 dataUrl 就原样返回。
export async function uploadLocalAssetToServer(
  asset: MediaAsset,
  draft: Draft,
  context: { unitId?: string; itemId?: string } = {},
): Promise<MediaAsset> {
  if (!asset.dataUrl) return asset;
  const file = await dataUrlToFile(asset.dataUrl, asset.name || `${asset.label}.jpg`, asset.type);
  return uploadAssetToServer({
    userName: getDraftUserName(draft),
    userPhone: getDraftUserPhone(draft),
    file,
    role: asset.role,
    label: asset.label,
    unitId: context.unitId,
    itemId: context.itemId,
  });
}

type TranscribeContext = {
  userName?: string;
  userPhone?: string;
  unitId?: string;
  itemId?: string;
  section?: string;
};

export async function transcribeAudio(
  blob: Blob,
  context: TranscribeContext = {},
): Promise<string> {
  const formData = new FormData();
  formData.set("file", blob, `voice.${audioExtForType(blob.type)}`);
  if (context.userName) formData.set("userName", context.userName);
  if (context.userPhone) formData.set("userPhone", context.userPhone);
  if (context.unitId) formData.set("unitId", context.unitId);
  if (context.itemId) formData.set("itemId", context.itemId);
  if (context.section) formData.set("section", context.section);

  const response = await fetch(apiPath(`${apiPrefix}/transcribe`), {
    method: "POST",
    body: formData,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "语音识别失败");
  }
  return (payload.text as string) || "";
}

function audioExtForType(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

export async function deleteAssetFromServer(draft: Draft, asset: MediaAsset) {
  if (!getDraftUserIdentity(draft) || !asset.url) return null;
  return requestJson<{ ok: boolean }>(
    `${apiPrefix}/assets/${encodeURIComponent(asset.id)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identityPayload(draft), url: asset.url }),
    },
  );
}

function stripInlineMedia(draft: Draft): Draft {
  return {
    ...draft,
    floorplanAssets: draft.floorplanAssets.map(stripAssetDataUrl),
    units: draft.units.map((unit) => ({
      ...unit,
      environmentAssets: unit.environmentAssets.map(stripAssetDataUrl),
      items: unit.items.map((item) => ({
        ...item,
        photos: item.photos.map(stripAssetDataUrl),
      })),
    })),
  };
}

function stripAssetDataUrl(asset: MediaAsset): MediaAsset {
  if (!asset.dataUrl) return asset;
  const { dataUrl: _dataUrl, ...rest } = asset;
  return rest;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), init);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "服务器请求失败");
  }
  return payload as T;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiPath(path: string) {
  return `${apiBaseUrl}${path}`;
}
