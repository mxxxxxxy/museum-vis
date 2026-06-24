export type Screen = "intro" | "info" | "collect" | "unit" | "item" | "review" | "success";
export type AssetRole = "environment" | "floorplan" | "photo" | "audio";

export type SubmissionInfo = {
  submitterName: string;
  submitterOrg: string;
  submitterPhone: string;
  submitterEmail: string;
  visitDate: string;
  city: string;
  museumName: string;
  museumAddress: string;
  exhibitionName: string;
  exhibitionPeriod: string;
  exhibitionLink: string;
  exhibitionIntro: string;
};

export type MediaAsset = {
  id: string;
  role: AssetRole;
  label: string;
  name: string;
  originalName?: string;
  type: string;
  size: number;
  dataUrl?: string;
  url?: string;
  createdAt: string;
};

export type VizItem = {
  id: string;
  serial: string;
  title: string;
  locationDescription: string;
  description: VizItemDescription;
  photos: MediaAsset[];
};

export type VizDescriptionKey =
  | "visualizationSelf"
  | "exhibitionFunction"
  | "humanInteraction"
  | "evaluation"
  | "additionalInfo";

export type VizItemDescription = {
  visualizationSelf: string;
  exhibitionFunction: string;
  humanInteraction: string;
  evaluation: string;
  additionalInfo: string;
};

export type Unit = {
  id: string;
  serial: string;
  name: string;
  description: string;
  environmentAssets: MediaAsset[];
  items: VizItem[];
};

export type Draft = {
  id: string;
  createdAt: string;
  updatedAt: string;
  info: SubmissionInfo;
  floorplanAssets: MediaAsset[];
  units: Unit[];
};
