import { LoaderCircle, Mic, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/api";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SECONDS = 120;
const formats = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

type Props = {
  disabled: boolean;
  replySelected: boolean;
  onSend: (audio: { base64: string; mimeType: string; fileName: string }) => Promise<void>;
};

function readAudio(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
      if (base64) resolve(base64);
      else reject(new Error("Não foi possível ler a gravação."));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a gravação."));
    reader.readAsDataURL(blob);
  });
}

export function WhatsAppAudioRecorder({ disabled, replySelected, onSend }: Props) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "stopping" | "preview">("idle");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const discard = useRef(false);

  function release() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      discard.current = true;
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      release();
    };
  }, []);

  useEffect(() => {
    if (!audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("A gravação de áudio não está disponível neste navegador ou conexão.");
      return;
    }
    const format = formats.find((value) => MediaRecorder.isTypeSupported(value));
    if (!format) {
      setError("Este navegador não oferece um formato de gravação compatível.");
      return;
    }
    const attempt = ++generation.current;
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: format });
      recorderRef.current = recorder;
      discard.current = false;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        size += event.data.size;
        if (size > MAX_BYTES) {
          discard.current = true;
          if (mounted.current) setError("A gravação excedeu o limite de 8 MB.");
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        discard.current = true;
        if (mounted.current) setError("Não foi possível gravar o áudio. Verifique o microfone.");
      };
      recorder.onstop = () => {
        release();
        if (!mounted.current) return;
        if (discard.current) {
          setPhase("idle");
          return;
        }
        const blob = new Blob(chunks, { type: format });
        if (!blob.size) {
          setError("A gravação está vazia. Tente novamente.");
          setPhase("idle");
          return;
        }
        setAudio(blob);
        setPhase("preview");
      };
      recorder.start(1000);
      setSeconds(0);
      setPhase("recording");
      const started = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recorder.state !== "inactive") recorder.stop();
      }, 1000);
    } catch {
      if (mounted.current && generation.current === attempt) {
        release();
        setPhase("idle");
        setError("Não foi possível acessar o microfone. Verifique a permissão no navegador.");
      }
    }
  }

  function cancel() {
    generation.current++;
    discard.current = true;
    setAudio(null);
    setError("");
    if (recorderRef.current?.state === "recording") {
      setPhase("stopping");
      recorderRef.current.stop();
      return;
    }
    release();
    setPhase("idle");
  }

  async function send() {
    if (!audio || sending || disabled || replySelected) return;
    setSending(true);
    setError("");
    try {
      const base64 = await readAudio(audio);
      const mimeType = audio.type.split(";")[0] ?? "";
      const extension = mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/ogg" ? "ogg" : "webm";
      await onSend({ base64, mimeType, fileName: `audio.${extension}` });
      if (mounted.current) {
        setAudio(null);
        setPhase("idle");
      }
    } catch (sendError) {
      if (mounted.current) setError(sendError instanceof Error && sendError.message === "Não foi possível ler a gravação." ? sendError.message : errorMessage(sendError));
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  const buttonClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#aebac1] transition hover:bg-[#2a3942] hover:text-white disabled:opacity-50";
  return <div className="min-w-0">
    {phase === "idle" && <button type="button" className={buttonClass} aria-label="Gravar áudio" title={replySelected ? "Cancele a resposta para gravar áudio" : "Gravar áudio"} disabled={disabled || replySelected} onClick={() => void start()}><Mic size={19} /></button>}
    {phase === "requesting" && <button type="button" className={buttonClass} aria-label="Cancelar acesso ao microfone" onClick={cancel}><LoaderCircle size={18} className="animate-spin" /></button>}
    {phase === "recording" && <div className="flex items-center gap-1">
      <span className="text-xs text-red-300" role="status">Gravando {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
      <button type="button" className={buttonClass} aria-label="Cancelar gravação" onClick={cancel}><Trash2 size={18} /></button>
      <button type="button" className={buttonClass} aria-label="Finalizar gravação" onClick={() => { setPhase("stopping"); recorderRef.current?.stop(); }}><Square size={18} /></button>
    </div>}
    {phase === "stopping" && <span className="text-xs text-[#aebac1]" role="status">Finalizando áudio...</span>}
    {phase === "preview" && <div className="flex flex-wrap items-center gap-1">
      {audioUrl && <audio className="h-10 max-w-48" controls src={audioUrl} aria-label="Prévia do áudio" />}
      <button type="button" className={buttonClass} aria-label="Descartar áudio" disabled={sending} onClick={cancel}><Trash2 size={18} /></button>
      <button type="button" className={buttonClass} aria-label="Enviar áudio" disabled={disabled || replySelected || sending} onClick={() => void send()}>{sending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}</button>
    </div>}
    {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
  </div>;
}
