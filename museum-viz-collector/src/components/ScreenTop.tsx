import { ArrowLeft } from "lucide-react";

export function ScreenTop({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div className="screen-top">
      {onBack ? (
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
      ) : null}
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}
