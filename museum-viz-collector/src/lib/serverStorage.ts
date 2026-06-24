import type { AssetRole, Draft, MediaAsset } from "../types";
import { prepareMediaFile } from "./media";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const apiBaseUrl = (env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiPrefix = "/exhibition_api";

type UploadAssetParams = {
  userName: string;
  file: File;
  role: AssetRole;
  label: string;
  unitId?: string;
  itemId?: string;
};

export function getDraftUserName(draft: Draft) {
  return draft.info.submitterName.trim();
}

export async function openServerSession(userName: string, draft: Draft) {
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, draft: stripInlineMedia(draft) }),
    },
  );
}

export async function saveDraftToServer(draft: Draft) {
  const userName = getDraftUserName(draft);
  if (!userName) return null;
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, draft: stripInlineMedia(draft) }),
    },
  );
}

export async function submitDraftToServer(draft: Draft) {
  const userName = getDraftUserName(draft);
  if (!userName) return null;
  return requestJson<{ draft: Draft }>(
    `${apiPrefix}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, draft: stripInlineMedia(draft) }),
    },
  );
}

export async function uploadAssetToServer({
  userName,
  file,
  role,
  label,
  unitId,
  itemId,
}: UploadAssetParams): Promise<MediaAsset> {
  const preparedFile = await prepareMediaFile(file);
  const formData = new FormData();
  formData.set("userName", userName);
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

type TranscribeContext = {
  userName?: string;
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
  const userName = getDraftUserName(draft);
  if (!userName || !asset.url) return null;
  return requestJson<{ ok: boolean }>(
    `${apiPrefix}/assets/${encodeURIComponent(asset.id)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, url: asset.url }),
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
