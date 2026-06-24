import { Check, Download } from "lucide-react";

export function SuccessScreen({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  return (
    <section className="screen">
      <div className="success-panel">
        <div className="hero-icon">
          <Check size={32} />
        </div>
        <h2>提交完成</h2>
        <p>
          数据已提交到服务器。本地备份可以单独导出，不会和提交操作自动绑定。
        </p>
        <div className="action-row center">
          <button className="secondary-button" type="button" onClick={onBack}>
            继续采集
          </button>
          <button className="primary-button" type="button" onClick={onExport}>
            <Download size={18} />
            导出数据包
          </button>
        </div>
      </div>
    </section>
  );
}
