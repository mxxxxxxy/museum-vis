import { Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HeicImage } from "../components/HeicImage";
import { itemDescriptionSections } from "../constants";
import { normalizeDraft } from "../lib/draft";
import type { Draft, MediaAsset } from "../types";

type ReviewSubmission = {
  userKey: string;
  draft: Partial<Draft>;
  stats: { units: number; items: number; assets: number };
  updatedAt: string;
  submittedAt: string;
  status: string;
  submitterName: string;
  submitterPhone: string;
  museumName: string;
  exhibitionName: string;
};

function mediaSrc(asset: MediaAsset) {
  return asset.url || asset.dataUrl || "";
}

function formatDate(value: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function downloadDraft(draft: Draft) {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${draft.id || "museum-viz-draft"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  const src = mediaSrc(asset);
  if (!src) return null;
  return (
    <a className="review-asset" href={src} target="_blank" rel="noreferrer">
      {asset.type.startsWith("image/") ? (
        <HeicImage src={src} type={asset.type} name={asset.name} alt={asset.label || asset.name} />
      ) : null}
      {asset.type.startsWith("audio/") ? <audio src={src} controls /> : null}
      <span>{asset.label || asset.originalName || asset.name}</span>
    </a>
  );
}

export function LocalReviewBrowser() {
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSubmissions() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/exhibition_api/review/submissions");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error === "REVIEW_DISABLED" ? "本地浏览模式未启用" : "读取失败");
      }
      const next = (payload.submissions || []) as ReviewSubmission[];
      setSubmissions(next);
      setSelectedKey((current) => current || next[0]?.userKey || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const candidates = needle
      ? submissions.filter((submission) =>
          [
            submission.submitterName,
            submission.submitterPhone,
            submission.museumName,
            submission.exhibitionName,
            submission.userKey,
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : submissions;
    return [...candidates].sort((a, b) => b.stats.assets - a.stats.assets);
  }, [query, submissions]);

  const selected = normalizeDraft(
    (submissions.find((submission) => submission.userKey === selectedKey) ?? filtered[0])?.draft ?? {},
  );
  const selectedSummary = submissions.find((submission) => submission.userKey === selectedKey) ?? filtered[0];

  return (
    <div className="review-browser">
      <header className="review-browser-header">
        <div>
          <p className="eyebrow">Local Review</p>
          <h1>采集数据浏览</h1>
        </div>
        <button className="secondary-button" type="button" onClick={loadSubmissions} disabled={loading}>
          <RefreshCw size={18} />
          刷新
        </button>
      </header>

      <div className="review-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索姓名、手机号、博物馆或展览"
        />
        <span>
          共 <strong>{submissions.length}</strong> 份
        </span>
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <main className="review-layout">
        <aside className="review-list" aria-label="提交列表">
          {filtered.map((submission) => (
            <button
              key={submission.userKey}
              className={submission.userKey === selectedKey ? "review-list-item active" : "review-list-item"}
              type="button"
              onClick={() => setSelectedKey(submission.userKey)}
            >
              <strong>{submission.submitterName || "未填写姓名"}</strong>
              <span>{submission.museumName || submission.exhibitionName || "未填写博物馆"}</span>
              <small>
                {submission.stats.units}单元/{submission.stats.items}项/{submission.stats.assets}资源
              </small>
            </button>
          ))}
          {!filtered.length ? <p className="review-empty">没有匹配的数据</p> : null}
        </aside>

        <section className="review-detail">
          {selectedSummary ? (
            <>
              <div className="panel review-detail-head">
                <div>
                  <h2>{selected.info.exhibitionName || "未填写展览名称"}</h2>
                  <p>
                    {selected.info.museumName || "未填写博物馆"} · {selected.info.city || "未填写城市"}
                  </p>
                </div>
                <button className="secondary-button" type="button" onClick={() => downloadDraft(selected)}>
                  <Download size={18} />
                  JSON
                </button>
              </div>

              <div className="panel review-meta-grid">
                <span>收集人：{selected.info.submitterName || "未填写"}</span>
                <span>单位：{selected.info.submitterOrg || "未填写"}</span>
                <span>手机：{selected.info.submitterPhone || "未填写"}</span>
                <span>更新时间：{formatDate(selected.updatedAt)}</span>
              </div>

              {selected.floorplanAssets.length ? (
                <div className="panel">
                  <h2>展览平面图</h2>
                  <div className="review-assets">
                    {selected.floorplanAssets.map((asset) => (
                      <AssetPreview key={asset.id} asset={asset} />
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.units.map((unit) => (
                <article className="panel review-unit" key={unit.id}>
                  <h2>
                    {unit.serial} {unit.name || "未命名单元"}
                  </h2>
                  <p>{unit.description || "未填写单元描述"}</p>
                  {unit.environmentAssets.length ? (
                    <div className="review-assets">
                      {unit.environmentAssets.map((asset) => (
                        <AssetPreview key={asset.id} asset={asset} />
                      ))}
                    </div>
                  ) : null}
                  <div className="review-items">
                    {unit.items.map((item) => (
                      <section className="review-item" key={item.id}>
                        <h3>
                          {item.serial}. {item.title || "未命名可视化项"}
                        </h3>
                        {item.locationDescription ? <p>{item.locationDescription}</p> : null}
                        <dl>
                          {itemDescriptionSections.map((section) => {
                            const value = item.description[section.key];
                            return value ? (
                              <div key={section.key}>
                                <dt>{section.title}</dt>
                                <dd>{value}</dd>
                              </div>
                            ) : null;
                          })}
                        </dl>
                        {item.photos.length ? (
                          <div className="review-assets">
                            {item.photos.map((asset) => (
                              <AssetPreview key={asset.id} asset={asset} />
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </>
          ) : (
            <div className="panel">
              <h2>暂无数据</h2>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
