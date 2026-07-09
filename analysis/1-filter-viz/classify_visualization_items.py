#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent
ANALYSIS_ROOT = PROJECT_ROOT.parent
WORKSPACE_ROOT = ANALYSIS_ROOT.parent
DEFAULT_INPUT_DIR = ANALYSIS_ROOT / "data" / "submissions"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "results" / "llm_visualization_filter.jsonl"
DEFAULT_SUMMARY = PROJECT_ROOT / "data" / "results" / "llm_visualization_filter.summary.json"

SYSTEM_PROMPT = """你是“博物馆展陈可视化”数据清洗员。你的任务是对一条众包采集记录进行初步筛选，判断它是否可能属于本项目关注的“展陈可视化”。

注意：本轮筛选只基于文字信息，不使用图片信息。你的任务不是做详细编码，不需要判断可视化类型、数据类型、视觉编码、交互类型或展览角色。你只需要判断这条记录是否应进入后续人工或模型辅助分析。

本项目中的“展陈可视化”指：

在博物馆展览中，为解释时间、空间、数量、流程、关系、分类、结构、演变、分布、比较或知识组织等信息，而被有意设计成视觉表达的内容。它可以是地图、时间线、图表、信息图、流程图、关系图、剖面图、结构图、工艺示意图、空间导览图、动态屏幕、交互装置或其他具有信息解释功能的视觉表达。

以下内容通常不纳入本项目范围：

1. 单独一件文物或展品本身；
2. 普通照片、人物照片、历史照片、建筑照片或现场照片；
3. 普通绘画、普通插画、场景复原图、宣传图，且没有明确的信息结构解释功能；
4. 只有标题、说明文字或大段介绍文字的普通展板；
5. 没有信息解释作用的装饰图案、背景纹样、灯光装饰；
6. 展柜、墙面、屏幕、投影设备等展陈设施本身；
7. 仅作为展览氛围、审美或叙事背景存在的视觉材料。

请特别注意：

1. 不要因为某个对象“是视觉内容”就判定为可视化。
2. 不要因为它出现在博物馆展览中就判定为可视化。
3. 判断关键是：它是否把某种时间、空间、数量、流程、关系、分类、结构、演变、分布、比较或知识组织转译成了视觉表达。
4. 如果记录描述的是文物本体、普通图片、普通文字展板、装饰或展陈设施，应判为 C。
5. 如果记录描述的是剖面图、工艺图、复原示意图、空间导览图等，但文字中显示它具有结构化解释功能，可以判为 B；如果文字中已明确说明其承担信息组织或解释功能，可以判为 A。
6. 如果文字信息过少，无法判断它是否具有信息结构表达功能，应判为 D。
7. 对于不确定案例，不要强行判为 A 或 C，优先判为 B 或 D。

分类标准：

A = 明确属于展陈可视化
记录文字清楚表明该对象通过视觉形式表达了时间、空间、数量、流程、关系、分类、结构、演变、分布、比较或知识组织等信息。

B = 可能属于展陈可视化，但属于弱可视化或边界案例
记录文字显示它可能具有解释、示意、组织或导览功能，但它不一定是典型图表；例如工艺示意图、剖面图、复原示意图、空间导览图、结构说明图等。

C = 明确不属于展陈可视化
记录文字显示它主要是文物、展品、普通图片、普通照片、普通绘画、普通文字展板、装饰图案、展柜或展陈设备本身，没有明确的信息结构表达功能。

D = 信息不足，无法判断
记录文字过短、过空泛、指代不明，无法判断该对象是否具有信息解释或结构化表达功能。

请只输出 JSON，不要输出额外解释。JSON 格式如下：

{
"label": "A/B/C/D",
"is_visualization": true/false/null,
"reason": "用一到三句话说明判断依据。只解释为什么进入该筛选类别，不做后续详细编码。"
}

输出规则：

* 如果 label 为 A，is_visualization 输出 true。
* 如果 label 为 B，is_visualization 输出 null。
* 如果 label 为 C，is_visualization 输出 false。
* 如果 label 为 D，is_visualization 输出 null。

"""


@dataclass(frozen=True)
class ApiConfig:
    api_key: str
    base_url: str
    model: str
    temperature: float
    timeout_seconds: float
    max_retries: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use an ikuncode/OpenAI-compatible LLM to pre-filter museum exhibition visualization records."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_DIR, help="Draft directory. Default: data/submissions")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSONL output path")
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY, help="Summary JSON path")
    parser.add_argument("--limit", type=int, default=None, help="Classify at most n records")
    parser.add_argument("--offset", type=int, default=0, help="Skip first n records before applying --limit")
    parser.add_argument("--concurrency", type=int, default=2, help="Parallel API calls")
    parser.add_argument("--resume", action="store_true", help="Skip records already present in the output JSONL")
    parser.add_argument("--dry-run", action="store_true", help="Print sample records without calling the LLM")
    parser.add_argument("--stop-on-error", action="store_true", help="Stop on the first failed API call")
    args = parser.parse_args()

    if args.offset < 0:
        parser.error("--offset must be a non-negative integer")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer")
    if args.concurrency < 1:
        parser.error("--concurrency must be a positive integer")
    return args


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_config() -> ApiConfig:
    load_dotenv(PROJECT_ROOT / ".env")
    return ApiConfig(
        api_key=os.environ.get("IKUNCODE_API_KEY", ""),
        base_url=normalize_base_url(os.environ.get("IKUNCODE_BASE_URL", "https://api.ikuncode.cc/v1")),
        model=os.environ.get("IKUNCODE_MODEL", "gpt-5.4-mini"),
        temperature=float(os.environ.get("IKUNCODE_TEMPERATURE", "0")),
        timeout_seconds=float(os.environ.get("IKUNCODE_TIMEOUT_SECONDS", os.environ.get("IKUNCODE_TIMEOUT_MS", "60000"))) / 1000
        if os.environ.get("IKUNCODE_TIMEOUT_MS")
        else float(os.environ.get("IKUNCODE_TIMEOUT_SECONDS", "60")),
        max_retries=int(os.environ.get("IKUNCODE_MAX_RETRIES", "2")),
    )


def normalize_base_url(raw_base_url: str) -> str:
    base_url = raw_base_url.rstrip("/")
    parsed = urllib.parse.urlparse(base_url)
    if parsed.netloc == "api.ikuncode.cc" and not parsed.path.rstrip("/").endswith("/v1"):
        return f"{base_url}/v1"
    return base_url


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def iter_draft_paths(input_dir: Path) -> list[Path]:
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")
    return sorted(path for path in input_dir.glob("*/draft.json") if path.is_file())


def read_records(input_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for draft_path in iter_draft_paths(input_dir):
        draft = json.loads(draft_path.read_text(encoding="utf-8"))
        user_key = draft_path.parent.name
        info = draft.get("info") or {}
        for unit_index, unit in enumerate(draft.get("units") or []):
            for item_index, item in enumerate(unit.get("items") or []):
                description = item.get("description") or {}
                input_text = {
                    "museumName": clean_text(info.get("museumName")),
                    "exhibitionName": clean_text(info.get("exhibitionName")),
                    "unitName": clean_text(unit.get("name")),
                    "unitDescription": clean_text(unit.get("description")),
                    "itemTitle": clean_text(item.get("title")),
                    "locationDescription": clean_text(item.get("locationDescription")),
                    "visualizationSelf": clean_text(description.get("visualizationSelf")),
                    "exhibitionFunction": clean_text(description.get("exhibitionFunction")),
                    "humanInteraction": clean_text(description.get("humanInteraction")),
                    "evaluation": clean_text(description.get("evaluation")),
                    "additionalInfo": clean_text(description.get("additionalInfo")),
                }
                unit_id = unit.get("id") or str(unit_index)
                item_id = item.get("id") or str(item_index)
                records.append(
                    {
                        "recordId": f"{user_key}/{unit_id}/{item_id}",
                        "userKey": user_key,
                        "draftId": draft.get("id") or "",
                        "draftPath": str(draft_path.relative_to(WORKSPACE_ROOT)),
                        "unitId": unit.get("id") or "",
                        "unitSerial": unit.get("serial") or "",
                        "unitIndex": unit_index,
                        "itemId": item.get("id") or "",
                        "itemSerial": item.get("serial") or "",
                        "itemIndex": item_index,
                        "photoCount": len(item.get("photos") or []),
                        "input": input_text,
                    }
                )
    return records


def build_user_prompt(input_text: dict[str, str]) -> str:
    return f"""输入信息：

* 博物馆：{input_text["museumName"]}
* 展览：{input_text["exhibitionName"]}
* 展厅单元：{input_text["unitName"]}
* 单元描述：{input_text["unitDescription"]}
* 项目标题：{input_text["itemTitle"]}
* 位置描述：{input_text["locationDescription"]}
* 可视化本身描述：{input_text["visualizationSelf"]}
* 展览功能描述：{input_text["exhibitionFunction"]}
* 交互形式描述：{input_text["humanInteraction"]}
* 评价：{input_text["evaluation"]}
* 补充信息：{input_text["additionalInfo"]}"""


def read_completed_record_ids(output_path: Path) -> set[str]:
    completed: set[str] = set()
    if not output_path.exists():
        return completed
    for line in output_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("status") == "ok" and row.get("recordId"):
            completed.add(row["recordId"])
    return completed


def post_chat_completion(config: ApiConfig, payload: dict[str, Any]) -> tuple[int, str]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{config.base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "museum-viz-collector/0.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def should_retry(status: int) -> bool:
    return status == 429 or status >= 500


def post_with_retry(config: ApiConfig, payload: dict[str, Any]) -> tuple[int, str]:
    last_status = 0
    last_text = ""
    for attempt in range(config.max_retries + 1):
        try:
            status, text = post_chat_completion(config, payload)
        except TimeoutError as error:
            status, text = 0, str(error)
        except OSError as error:
            status, text = 0, str(error)
        last_status, last_text = status, text
        if not should_retry(status) or attempt == config.max_retries:
            return status, text
        time.sleep(0.75 * (2**attempt))
    return last_status, last_text


def parse_json_content(content: str) -> dict[str, Any]:
    text = content.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError(f"Model output was not JSON: {text[:300]}")
        return json.loads(text[start : end + 1])


def normalize_classification(value: dict[str, Any]) -> dict[str, Any]:
    label = clean_text(value.get("label")).upper()
    if label not in {"A", "B", "C", "D"}:
        raise ValueError(f"Invalid label from model: {value.get('label')}")
    expected = {"A": True, "B": None, "C": False, "D": None}[label]
    actual = value.get("is_visualization")
    if actual != expected:
        raise ValueError(f"is_visualization={actual!r} is inconsistent with label={label}")
    return {
        "label": label,
        "is_visualization": expected,
        "reason": clean_text(value.get("reason")),
    }


def classify_record(record: dict[str, Any], config: ApiConfig) -> dict[str, Any]:
    payload = {
        "model": config.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(record["input"])},
        ],
        "temperature": config.temperature,
        "response_format": {"type": "json_object"},
    }
    status, text = post_with_retry(config, payload)
    if status == 400:
        fallback_payload = dict(payload)
        fallback_payload.pop("response_format", None)
        status, text = post_with_retry(config, fallback_payload)
    if status < 200 or status >= 300:
        raise RuntimeError(f"API {status}: {text[:600]}")

    data = json.loads(text)
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise ValueError("API response did not contain choices[0].message.content")
    return normalize_classification(parse_json_content(content))


def source_from_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "userKey": record["userKey"],
        "draftId": record["draftId"],
        "draftPath": record["draftPath"],
        "unitId": record["unitId"],
        "unitSerial": record["unitSerial"],
        "unitIndex": record["unitIndex"],
        "itemId": record["itemId"],
        "itemSerial": record["itemSerial"],
        "itemIndex": record["itemIndex"],
        "photoCount": record["photoCount"],
    }


def append_jsonl(output_path: Path, row: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_summary(
    summary_path: Path,
    rows: list[dict[str, Any]],
    total_records: int,
    selected_records: int,
    skipped_records: int,
) -> None:
    labels = {"A": 0, "B": 0, "C": 0, "D": 0}
    ok = 0
    error = 0
    for row in rows:
        if row.get("status") == "ok":
            ok += 1
            labels[row["result"]["label"]] += 1
        elif row.get("status") == "error":
            error += 1

    summary = {
        "generatedAt": utc_now(),
        "totalRecords": total_records,
        "selectedRecords": selected_records,
        "skippedRecords": skipped_records,
        "processedThisRun": len(rows),
        "ok": ok,
        "error": error,
        "labels": labels,
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def make_ok_row(record: dict[str, Any], result: dict[str, Any], model: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "status": "ok",
        "recordId": record["recordId"],
        "classifiedAt": utc_now(),
        "model": model,
        "source": source_from_record(record),
        "input": record["input"],
        "result": result,
    }


def make_error_row(record: dict[str, Any], error: Exception, model: str, started_at: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "status": "error",
        "recordId": record["recordId"],
        "startedAt": started_at,
        "failedAt": utc_now(),
        "model": model,
        "source": source_from_record(record),
        "input": record["input"],
        "error": str(error),
    }


def process_record(record: dict[str, Any], config: ApiConfig) -> dict[str, Any]:
    started_at = utc_now()
    try:
        result = classify_record(record, config)
        return make_ok_row(record, result, config.model)
    except Exception as error:
        return make_error_row(record, error, config.model, started_at)


def main() -> int:
    args = parse_args()
    config = get_config()
    all_records = read_records(args.input)
    completed = read_completed_record_ids(args.output) if args.resume else set()
    window = all_records[args.offset : args.offset + args.limit if args.limit is not None else None]
    selected = [record for record in window if record["recordId"] not in completed]

    print(f"Found {len(all_records)} item records.")
    print(f"Selected {len(selected)} records. Skipped by resume: {len(completed)}.")

    if args.dry_run:
        for record in selected[: args.limit or 5]:
            print(json.dumps(record, ensure_ascii=False, indent=2))
        return 0

    if not config.api_key:
        print("IKUNCODE_API_KEY is required. Put it in the environment or .env, or run with --dry-run.", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(process_record, record, config): (index, record) for index, record in enumerate(selected)}
        for future in as_completed(futures):
            index, record = futures[future]
            row = future.result()
            append_jsonl(args.output, row)
            rows.append(row)
            if row["status"] == "ok":
                print(f"[{index + 1}/{len(selected)}] {row['result']['label']} {record['recordId']}")
            else:
                print(f"[{index + 1}/{len(selected)}] ERROR {record['recordId']}: {row['error']}", file=sys.stderr)
                if args.stop_on_error:
                    write_summary(args.summary, rows, len(all_records), len(selected), len(completed))
                    return 1

    write_summary(args.summary, rows, len(all_records), len(selected), len(completed))
    print(f"Wrote JSONL: {args.output}")
    print(f"Wrote summary: {args.summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
