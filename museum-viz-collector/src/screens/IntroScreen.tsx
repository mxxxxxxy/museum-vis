import { Building2, ChevronRight, FileImage, Layers } from "lucide-react";

export function IntroScreen({
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
