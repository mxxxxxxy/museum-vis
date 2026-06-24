import type { SubmissionInfo, VizDescriptionKey } from "./types";

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

export const itemDescriptionSections: Array<{
  key: VizDescriptionKey;
  title: string;
  missingLabel: string;
  helper: string;
  placeholder: string;
  required: boolean;
}> = [
    {
      key: "visualizationSelf",
      title: "可视化描述",
      missingLabel: "可视化描述",
      helper: "包括不限于: 可视化类型、内容主题、编码了哪些数据，以及用位置、长度、颜色、大小等哪些视觉通道表达。",
      placeholder: "",
      required: true,
    },
    {
      key: "exhibitionFunction",
      title: "可视化在展览中的功能",
      missingLabel: "展览功能描述",
      helper: "包括不限于: 相比旁边文字说明或实物展品，它带来什么新信息；在展览中起到概览、导览、解释背景、展示关系、呈现变化或帮助比较等什么作用。",
      placeholder: "",
      required: true,
    },
    {
      key: "humanInteraction",
      title: "和人的交互形式",
      missingLabel: "交互形式描述",
      helper: "包括不限于: 是否可交互、媒介与物理形态；观众是看、触屏、走进去还是动手；它和周围展品、入口/中段/高潮/出口等展线位置的关系。",
      placeholder: "",
      required: true,
    },
    {
      key: "evaluation",
      title: "你对它的评价",
      missingLabel: "评价描述",
      helper: "包括不限于: 第一眼观感、是否好看或有冲击力；看不看得懂、要不要先验知识；有没有损坏、黑屏、褪色、失灵、内容过时；也可写不同观众是否友好。",
      placeholder: "",
      required: true,
    },
    {
      key: "additionalInfo",
      title: "其他补充",
      missingLabel: "其他补充",
      helper: "可选: 任何你获得关于该可视化的信息、任何其他你的感想、建议等。",
      placeholder: "",
      required: false,
    },
  ];
