import { emptyInfo } from "../constants";
import type { AssetRole, Draft, MediaAsset, SubmissionInfo, Unit, VizItem } from "../types";
import { uid } from "./id";

export type Stats = { units: number; items: number; assets: number };

export function createUnit(index = 1): Unit {
  return {
    id: uid("unit"),
    serial: `单元${index}`,
    name: "",
    description: "",
    environmentAssets: [],
    items: [],
  };
}

export function createItem(index: number): VizItem {
  return {
    id: uid("item"),
    serial: `${index}`,
    title: "",
    locationDescription: "",
    description: "",
    visualizationTypes: [],
    mediaTypes: [],
    photos: [],
  };
}

export function renumberItems(items: VizItem[] = []): VizItem[] {
  return items.map((item, index) => ({
    ...item,
    serial: `${index + 1}`,
  }));
}

function normalizeAsset(asset: Partial<MediaAsset> | undefined, fallbackRole: AssetRole): MediaAsset {
  return {
    id: asset?.id ?? uid("asset"),
    role: asset?.role ?? fallbackRole,
    label: asset?.label ?? "照片",
    name: asset?.name ?? "photo.jpg",
    originalName: asset?.originalName,
    type: asset?.type ?? "image/jpeg",
    size: asset?.size ?? 0,
    dataUrl: asset?.dataUrl ?? "",
    url: asset?.url,
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

export function normalizeUnits(
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
      items: renumberItems((unit.items ?? []).map((item) => normalizeItem(item))),
    };
  });
}

export function normalizeDraft(draft: Partial<Draft>): Draft {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? `draft-${Date.now().toString(36)}`,
    createdAt: draft.createdAt ?? now,
    updatedAt: draft.updatedAt ?? now,
    info: { ...emptyInfo, ...(draft.info ?? {}) },
    units: normalizeUnits(draft.units ?? []),
  };
}

export function createDraft(): Draft {
  return normalizeDraft({});
}

export const COLLECTOR_REQUIRED_FIELDS: Array<keyof SubmissionInfo> = [
  "submitterName",
  "submitterOrg",
];

export const VENUE_REQUIRED_FIELDS: Array<keyof SubmissionInfo> = [
  "visitDate",
  "city",
  "museumName",
  "museumAddress",
  "exhibitionName",
];

export function isInfoSectionComplete(
  info: SubmissionInfo,
  fields: Array<keyof SubmissionInfo>,
) {
  return fields.every((field) => info[field].trim().length > 0);
}

export function getRequiredInfoMissing(info: SubmissionInfo) {
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

export function countAssets(draft: Draft): Stats {
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
