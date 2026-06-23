import { Check, Download } from "lucide-react";

export function SuccessScreen({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
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
