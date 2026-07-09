import type { SubmissionInfo, VizDescriptionKey } from "./types";

export const STORAGE_KEY = "museum-viz-collector-draft-v3";
// 记录“是否已点过数据收集正式进入采集”，以便同设备刷新后不被打回锁定首页。
export const ENTERED_KEY = "museum-viz-collector-entered-v1";
// 全局控制所有“导出数据包”入口。导出逻辑保留，按部署/调试场景需要时改为 true。
export const SHOW_EXPORT_DATA_PACKAGE_ACTIONS = false;

export const emptyInfo: SubmissionInfo = {
  submitterName: "",
  submitterOrg: "",
  submitterPhone: "",
  submitterEmail: "",
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
      helper: "从可视化自身出发，描述可视化技术和讲述的数据故事。包括但不限于：采用了哪种基础的图表类型或技术形态，如何通过色彩、形状等视觉通道来编码数据的。",
      placeholder: "",
      required: true,
    },
    {
      key: "exhibitionFunction",
      title: "可视化在展览中的功能",
      missingLabel: "展览功能描述",
      helper: "将可视化置于整个展览中审视它所扮演的策展角色。包括但不限于：在整体展陈叙事中发挥了怎样的作用，是为展览提供宏观总览、增强观众的代入感，还是负责对特定细节进行视觉补充，亦或是在不同的展陈单元之间起到了的过渡与衔接。在数据故事叙事中，扮演了什么样的角色。比如作为整体叙事的引入、衔接，还是高潮或结尾。相比旁边文字说明或实物展品，带来什么新信息等等。",
      placeholder: "",
      required: true,
    },
    {
      key: "humanInteraction",
      title: "空间布局与交互形式",
      missingLabel: "交互形式描述",
      helper: "包括但不限于：观众在真实物理空间中与这件作品产生的互动连结，比如是否包含了动态的机械装置，或者是否鼓励观众通过在展厅中的走动、视角的切换来探索不同的信息层级。物理媒介是什么。在空间布局上，它处于参观动线的什么位置，与周围的实物展品或图文展板形成了怎样的配合关系。观众与它的交互方式，是单向的视觉浏览、身体的空间移动，还是直接的物理触控等等",
      placeholder: "",
      required: true,
    },
    {
      key: "evaluation",
      title: "你对它的评价",
      missingLabel: "评价描述",
      helper: "结合主观感受与现场的客观观察，给出对该可视化的综合评价或改进建议。包括但不限于对该可视化本身的评价，其美学表现与易读性的个人感受，现场其他观众的真实反馈与兴趣程度，从日常运维的角度对作品保存状态的看法或建设性的改进建议等等。",
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
