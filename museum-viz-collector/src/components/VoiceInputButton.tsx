import { Loader2, Mic, Square } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

const MAX_RECORD_SECONDS = 60;
const MAX_RECORD_MS = MAX_RECORD_SECONDS * 1000;

type RecorderState = "idle" | "recording" | "processing";

export function VoiceInputButton({
  onText,
  onTranscribe,
  disabled,
}: {
  onText: (text: string) => void;
  onTranscribe: (blob: Blob) => Promise<string>;
  disabled?: boolean;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportsRecorder =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    return () => {
      clearTimers();
      stopStream();
    };
  }, []);

  function clearTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    if (disabled || state !== "idle") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopStream();
        void handleBlob(blob);
      };
      recorder.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = window.setInterval(
        () => setSeconds((current) => current + 1),
        1000,
      );
      autoStopRef.current = window.setTimeout(stopRecording, MAX_RECORD_MS);
    } catch {
      stopStream();
      setError("麦克风打不开，请检查权限");
      setState("idle");
    }
  }

  function stopRecording() {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setState("processing");
      recorder.stop();
    }
  }

  async function handleBlob(blob: Blob) {
    setState("processing");
    try {
      const text = (await onTranscribe(blob)).trim();
      if (text) {
        onText(text);
      } else {
        setError("没听清，请再说一次");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "识别失败");
    } finally {
      setState("idle");
      setSeconds(0);
    }
  }

  function handleFileFallback(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleBlob(file);
  }

  const control = (() => {
    if (state === "recording") {
      return (
        <button type="button" className="voice-button is-recording" onClick={stopRecording}>
          <Square size={12} />
          <span>停止 {Math.max(0, MAX_RECORD_SECONDS - seconds)}s</span>
        </button>
      );
    }

    const busy = state === "processing";
    const icon = busy ? <Loader2 size={14} className="voice-spin" /> : <Mic size={14} />;
    const label = busy ? "识别中" : "语音";

    if (!supportsRecorder) {
      return (
        <>
          <button
            type="button"
            className="voice-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || busy}
          >
            {icon}
            <span>{label}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            capture
            hidden
            onChange={handleFileFallback}
          />
        </>
      );
    }

    return (
      <button
        type="button"
        className="voice-button"
        onClick={startRecording}
        disabled={disabled || busy}
        title="按一下开始说话，再按停止"
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  })();

  return (
    <span className="voice-input">
      {control}
      {error ? <span className="voice-error">{error}</span> : null}
    </span>
  );
}
