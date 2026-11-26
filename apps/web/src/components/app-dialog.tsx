import { AlertTriangle, CircleHelp, MessageSquareText, X } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui/button";

type DialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
};
type PromptOptions = DialogOptions & { initialValue?: string };
type DialogRequest = DialogOptions & {
  id: number;
  kind: "alert" | "confirm" | "prompt";
  initialValue?: string;
  resolve: (value: string | null) => void;
};
type DialogActions = {
  alert: (options: DialogOptions) => Promise<void>;
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogActions | null>(null);

function Dialog({ request, finish }: { request: DialogRequest; finish: (value: string | null) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = request.kind === "prompt" ? MessageSquareText : request.destructive ? AlertTriangle : CircleHelp;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    (inputRef.current ?? dialog.querySelector<HTMLButtonElement>("[data-dialog-focus]"))?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="app-dialog-title"
      aria-describedby="app-dialog-message"
      onCancel={(event) => { event.preventDefault(); finish(null); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      }}
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-black/5 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={(event) => {
        event.preventDefault();
        finish(request.kind === "prompt" ? inputRef.current?.value ?? "" : "confirm");
      }} className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${request.destructive ? "bg-red-50 text-red-700" : "bg-[#eaf0e8] text-pine"}`}>
            <Icon size={22} />
          </span>
          <button type="button" aria-label="Fechar" onClick={() => finish(null)} className="rounded-full p-2 text-muted transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"><X size={18} /></button>
        </div>
        <h2 id="app-dialog-title" className="mt-5 text-xl font-black tracking-tight">{request.title}</h2>
        <p id="app-dialog-message" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{request.message}</p>
        {request.kind === "prompt" && (
          <input ref={inputRef} aria-label={request.message} className="field-input mt-5" defaultValue={request.initialValue ?? ""} />
        )}
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {request.kind !== "alert" && <Button data-dialog-focus={request.kind === "confirm" ? "" : undefined} type="button" variant="outline" onClick={() => finish(null)}>Cancelar</Button>}
          <Button data-dialog-focus={request.kind === "alert" ? "" : undefined} type="submit" className={request.destructive ? "!bg-red-700 !text-white hover:!bg-red-800" : ""}>
            {request.confirmLabel ?? (request.kind === "alert" ? "Entendi" : "Confirmar")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const queue = useRef<DialogRequest[]>([]);
  const nextId = useRef(0);

  const actions = useMemo<DialogActions>(() => {
    function open(kind: DialogRequest["kind"], options: PromptOptions) {
      return new Promise<string | null>((resolve) => {
        const request = { ...options, kind, id: nextId.current++, resolve };
        queue.current.push(request);
        if (queue.current.length === 1) setCurrent(request);
      });
    }
    return {
      alert: async (options) => { await open("alert", options); },
      confirm: async (options) => (await open("confirm", options)) === "confirm",
      prompt: (options) => open("prompt", options),
    };
  }, []);

  function finish(value: string | null) {
    const request = queue.current.shift();
    if (!request) return;
    setCurrent(queue.current[0] ?? null);
    request.resolve(value);
  }

  return (
    <DialogContext.Provider value={actions}>
      {children}
      {current && <Dialog key={current.id} request={current} finish={finish} />}
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const dialog = useContext(DialogContext);
  if (!dialog) throw new Error("useAppDialog must be used within AppDialogProvider.");
  return dialog;
}
