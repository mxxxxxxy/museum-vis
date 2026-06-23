import type { SubmissionInfo } from "./types";

export const STORAGE_KEY = "museum-viz-collector-draft-v2";

export const emptyInfo: SubmissionInfo = {
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

export const visualizationTypeOptions = [
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

export const mediaTypeOptions = [
  "墙面印刷",
  "立体展板",
  "屏幕",
  "投影",
  "灯箱",
  "展柜",
  "复合媒介",
  "其他",
];
