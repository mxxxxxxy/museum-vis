import { Check, Download, Search } from "lucide-react";

export function SuccessScreen({
  onBack,
  onExport,
  showExportActions,
}: {
  onBack: () => void;
  onExport: () => void;
  showExportActions: boolean;
}) {
  return (
    <section className="screen">
      <div className="success-panel">
        <div className="hero-icon">
          <Check size={32} />
        </div>
        <h2>提交完成</h2>
        <p>
          {showExportActions
            ? "本地备份可以单独导出。"
            : "可继续补充内容。"}
        </p>
        <div className="action-row center">
          <button className="primary-button" type="button" onClick={onBack}>
            <Search size={18} />
            继续调研
          </button>
          {showExportActions ? (
            <button className="secondary-button" type="button" onClick={onExport}>
              <Download size={18} />
              导出数据包
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
