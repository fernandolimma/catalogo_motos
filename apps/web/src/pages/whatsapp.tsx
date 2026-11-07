import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, BellOff, Check, Columns3, FileText, Forward, LoaderCircle, LogOut, MessageCircle, Paperclip, Pencil, Pin, QrCode, Reply, Search, Send, Smartphone, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { api, errorMessage } from "../lib/api";

type Session = { user?: { id: string; name: string; role: string } };
type ChatMessage = {
  id: string;
  content: string;
  fromMe: boolean;
  status: string;
  createdAt: string;
  mediaType: string | null;
  mimeType: string | null;
  fileName: string | null;
  quotedContent: string | null;
  reaction: string | null;
  isDeleted: boolean;
};
type Chat = {
  id: string;
  remoteJid: string;
  updatedAt: string;
  lead?: { id: string; name: string; phone: string } | null;
  messages: ChatMessage[];
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  isStarred: boolean;
  _count: { messages: number };
};
type Connection = { configured: boolean; state: string; qrCode?: string | null; pairingCode?: string | null };
type ChatFilter = "all" | "unread" | "starred" | "archived";

function contactPhone(remoteJid: string) {
  return remoteJid.split("@")[0]?.split(":")[0] ?? remoteJid;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(value));
}

function MessageMedia({ chatId, message }: { chatId: string; message: ChatMessage }) {
  const [requested, setRequested] = useState(false);
  const media = useQuery({
    queryKey: ["whatsapp-media", chatId, message.id],
    queryFn: async () => (await api.get<{ dataUrl: string; mimeType: string; fileName: string | null }>(
      `/whatsapp/chats/${chatId}/messages/${message.id}/media`,
    )).data,
    enabled: requested,
    staleTime: 5 * 60_000,
  });
  if (!requested) {
    return <button type="button" className="my-2 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs font-semibold hover:bg-black/20" onClick={() => setRequested(true)}>
      <FileText size={15} /> Carregar {message.mediaType === "image" ? "imagem" : message.mediaType === "video" ? "vídeo" : message.mediaType === "audio" ? "áudio" : "arquivo"}
    </button>;
  }
  if (media.isLoading) return <p className="my-2 text-xs text-muted">Carregando mídia...</p>;
  if (media.isError) return <p className="my-2 text-xs text-red-700" role="alert">{errorMessage(media.error)}</p>;
  if (!media.data) return null;
  if (message.mediaType === "image") return <img className="my-2 max-h-80 max-w-full rounded-lg object-contain" src={media.data.dataUrl} alt={message.content} />;
  if (message.mediaType === "video") return <video className="my-2 max-h-80 max-w-full rounded-lg" controls src={media.data.dataUrl} />;
  if (message.mediaType === "audio") return <audio className="my-2 max-w-full" controls src={media.data.dataUrl} />;
  return <a className="my-2 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs font-semibold underline" href={media.data.dataUrl} download={media.data.fileName ?? message.fileName ?? "arquivo"}>
    <FileText size={15} /> {media.data.fileName ?? message.fileName ?? "Baixar arquivo"}
  </a>;
}

export function WhatsAppPage() {
  const navigate = useNavigate();
  const { leadId } = useSearch({ from: "/admin/whatsapp" });
  const cache = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: async () => {
      await cache.clear();
      await navigate({ to: "/login" });
    },
  });
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const auth = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await api.get<Session>("/auth/me")).data,
  });
  const currentUser = auth.data?.user;
  const connection = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async () => (await api.get<Connection>("/whatsapp/status")).data,
    enabled: auth.isSuccess,
    refetchInterval: 10_000,
  });
  const chats = useQuery({
    queryKey: ["whatsapp-chats", chatSearch, chatFilter],
    queryFn: async () => (await api.get<{ items: Chat[] }>("/whatsapp/chats", {
      params: { q: chatSearch.trim() || undefined, filter: chatFilter },
    })).data.items,
    enabled: auth.isSuccess,
    refetchInterval: 10_000,
  });
  const leadChat = useQuery({
    queryKey: ["whatsapp-lead-chat", leadId],
    queryFn: async () => (await api.post<{ item: Chat }>(`/whatsapp/leads/${leadId}/chat`)).data.item,
    enabled: auth.isSuccess && Boolean(leadId),
    retry: false,
  });
  const messages = useQuery({
    queryKey: ["whatsapp-messages", selectedChat],
    queryFn: async () => (await api.get<{ items: ChatMessage[] }>(`/whatsapp/chats/${selectedChat}/messages`)).data.items,
    enabled: auth.isSuccess && selectedChat !== null,
    refetchInterval: 5_000,
  });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);
  useEffect(() => {
    if (leadChat.data) void cache.invalidateQueries({ queryKey: ["whatsapp-chats"] });
  }, [cache, leadChat.data]);
  useEffect(() => {
    if (leadId) {
      if (leadChat.data) {
        setChatSearch("");
        setChatFilter(leadChat.data.isArchived ? "archived" : "all");
        setSelectedChat(leadChat.data.id);
      }
      return;
    }
    if (!chats.data) return;
    if (selectedChat && !chats.data.some((chat) => chat.id === selectedChat)) setSelectedChat(null);
    if (!selectedChat && chatFilter !== "unread" && chats.data.length) setSelectedChat(chats.data[0]?.id ?? null);
  }, [chatFilter, chats.data, leadChat.data, leadId, selectedChat]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const connect = useMutation({
    mutationFn: async () => (await api.post<Connection>("/whatsapp/connect")).data,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["whatsapp-status"] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
      ]);
    },
  });
  const send = useMutation({
    mutationFn: async () => api.post(`/whatsapp/chats/${selectedChat}/messages`, {
      text,
      ...(replyTo ? { quotedMessageId: replyTo.id } : {}),
    }),
    onSuccess: async () => {
      setText("");
      setReplyTo(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["whatsapp-messages", selectedChat] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
      ]);
    },
  });
  const sendMedia = useMutation({
    mutationFn: async (input: { fileName: string; mimeType: string; base64: string; caption: string; quotedMessageId?: string }) =>
      api.post(`/whatsapp/chats/${selectedChat}/media`, input),
    onSuccess: async () => {
      setText("");
      setReplyTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["whatsapp-messages", selectedChat] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
      ]);
    },
  });
  const react = useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: string; reaction: string }) =>
      api.post(`/whatsapp/chats/${selectedChat}/messages/${messageId}/reaction`, { reaction }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["whatsapp-messages", selectedChat] });
    },
  });
  const editMessage = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) =>
      api.patch(`/whatsapp/chats/${selectedChat}/messages/${messageId}`, { text: content }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["whatsapp-messages", selectedChat] });
    },
  });
  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => api.delete(`/whatsapp/chats/${selectedChat}/messages/${messageId}`),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["whatsapp-messages", selectedChat] });
    },
  });
  const forwardMessage = useMutation({
    mutationFn: async () => api.post(`/whatsapp/chats/${selectedChat}/messages/${forwardingMessage?.id}/forward`, { targetChatId: forwardTarget }),
    onSuccess: async () => {
      setForwardingMessage(null);
      setForwardTarget("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["whatsapp-messages"] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
      ]);
    },
  });
  function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      window.alert("O arquivo deve ter no máximo 8 MB.");
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        window.alert("Não foi possível ler o arquivo selecionado.");
        return;
      }
      sendMedia.mutate({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64,
        caption: text.trim(),
        ...(replyTo ? { quotedMessageId: replyTo.id } : {}),
      });
    };
    reader.onerror = () => window.alert("Falha ao ler o arquivo selecionado.");
    reader.readAsDataURL(file);
  }
  const updateChat = useMutation({
    mutationFn: async ({ chatId, preference }: {
      chatId: string;
      preference: { isPinned?: boolean; isArchived?: boolean; isMuted?: boolean; isStarred?: boolean };
    }) => api.patch(`/whatsapp/chats/${chatId}/preferences`, preference),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["whatsapp-chats"] });
    },
  });
  const markRead = useMutation({
    mutationFn: async (chatId: string) => api.patch(`/whatsapp/chats/${chatId}/read`),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["whatsapp-chats"] });
    },
  });
  const markChatRead = markRead.mutate;
  useEffect(() => {
    if (selectedChat) markChatRead(selectedChat);
  }, [markChatRead, selectedChat]);

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  if (!["ADMIN", "SUPERVISOR", "MANAGER", "SELLER"].includes(currentUser?.role ?? "")) {
    return <main className="page-wrap py-24 text-center"><p className="font-bold">Seu perfil não pode acessar o chat do WhatsApp.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;
  }
  const isAdmin = currentUser?.role === "ADMIN";
  const activeChat = chats.data?.find((chat) => chat.id === selectedChat)
    ?? (leadChat.data?.id === selectedChat ? leadChat.data : undefined);
  const qrCode = connect.data?.qrCode;
  const qrSource = qrCode ? (qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`) : null;
  const isConnected = connection.data?.state === "open" || connect.data?.state === "open";

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "SELLER"} fullScreen>
      <div className="grid h-[100dvh] min-h-[560px] grid-cols-1 overflow-hidden bg-[#0b141a] text-[#e9edef] md:grid-cols-[minmax(300px,32%)_minmax(0,1fr)]">
        <section aria-label="Conversas" className={`${selectedChat ? "hidden" : "flex"} min-h-0 flex-col border-r border-[#2a3942] bg-[#111b21] md:flex`}>
          <header className="border-b border-[#2a3942] px-3 py-3">
            <div className="mb-3 flex items-center justify-between">
              <h1 className="text-xl font-bold tracking-tight">WhatsApp</h1>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-[#202c33] px-2.5 py-1 text-[10px] font-semibold text-[#aebac1]">
                  <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-[#00a884]" : "bg-amber-500"}`} />
                  {connection.isLoading ? "Verificando" : isConnected ? "Conectado" : "Desconectado"}
                </span>
                <Link to="/admin/funil" title="Voltar ao funil de vendas" aria-label="Voltar ao funil de vendas" className="rounded-full p-2 text-[#aebac1] transition hover:bg-[#202c33] hover:text-white">
                  <Columns3 size={18} />
                </Link>
                <button type="button" title="Sair" aria-label="Sair do sistema" onClick={() => logout.mutate()} disabled={logout.isPending} className="rounded-full p-2 text-[#aebac1] transition hover:bg-[#202c33] hover:text-white disabled:opacity-50">
                  <LogOut size={17} />
                </button>
              </div>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg bg-[#202c33] px-3 text-[#aebac1] focus-within:ring-1 focus-within:ring-[#00a884]">
              <Search size={16} className="shrink-0" />
              <input
                className="w-full bg-transparent text-xs text-[#e9edef] outline-none placeholder:text-[#8696a0]"
                aria-label="Pesquisar conversas e mensagens"
                placeholder="Pesquisar ou começar uma nova conversa"
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
              />
            </label>
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar conversas">
              {([
                ["all", "Todas"],
                ["unread", "Não lidas"],
                ["starred", "Favoritas"],
                ["archived", "Arquivadas"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={chatFilter === value}
                  onClick={() => setChatFilter(value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${chatFilter === value ? "border-[#00a884] bg-[#005c4b] text-[#d9fdd3]" : "border-[#2a3942] text-[#aebac1] hover:bg-[#202c33]"}`}
                >{label}</button>
              ))}
            </div>
          </header>

          {!isConnected && isAdmin && (
            <div className="border-b border-[#2a3942] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Smartphone size={17} className="shrink-0 text-[#00a884]" />
                  <p className="truncate text-xs font-semibold">Conecte o WhatsApp da loja</p>
                </div>
                <Button type="button" size="small" className="!min-h-8 !rounded-lg !bg-[#00a884] !px-3 !text-[10px] !text-white hover:!bg-[#06cf9c]" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connect.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <QrCode size={13} />}
                  {connect.isPending ? "Gerando..." : "Conectar"}
                </Button>
              </div>
              {qrSource && <div className="mt-3 flex items-center gap-3 rounded-lg bg-[#202c33] p-2.5">
                <img className="h-20 w-20 rounded bg-white p-1" src={qrSource} alt="QR Code para conectar o WhatsApp" />
                <div className="min-w-0"><p className="text-xs font-semibold">Leia o QR Code</p><p className="mt-1 text-[10px] leading-4 text-[#aebac1]">WhatsApp &gt; Aparelhos conectados</p>{connect.data?.pairingCode && <p className="mt-1 text-[10px]">Código: {connect.data.pairingCode}</p>}</div>
              </div>}
            </div>
          )}
          {!isConnected && !isAdmin && <p className="border-b border-[#2a3942] p-3 text-xs text-amber-300">Peça ao administrador para conectar o WhatsApp.</p>}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {connection.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(connection.error)}</p>}
            {leadId && leadChat.isLoading && <p className="m-3 rounded-lg bg-[#202c33] p-3 text-xs text-[#aebac1]">Localizando a conversa deste Lead...</p>}
            {leadId && leadChat.isError && <p className="m-3 rounded-lg bg-amber-950/60 p-3 text-xs text-amber-200" role="status">{errorMessage(leadChat.error)}</p>}
            {connect.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(connect.error)}</p>}
            {updateChat.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(updateChat.error)}</p>}
            {markRead.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(markRead.error)}</p>}
            {sendMedia.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(sendMedia.error)}</p>}
            {react.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(react.error)}</p>}
            {editMessage.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(editMessage.error)}</p>}
            {deleteMessage.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(deleteMessage.error)}</p>}
            {forwardMessage.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(forwardMessage.error)}</p>}
            {chats.isLoading && <p className="p-5 text-xs text-[#aebac1]">Carregando conversas...</p>}
            {chats.isError && <p className="m-3 rounded-lg bg-red-950/60 p-3 text-xs text-red-200" role="alert">{errorMessage(chats.error)}</p>}
            {!chats.isLoading && !chats.isError && !chats.data?.length && <div className="p-6 text-center"><MessageCircle className="mx-auto text-[#8696a0]" size={22} /><p className="mt-3 text-sm font-semibold">{chatSearch || chatFilter !== "all" ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}</p><p className="mt-1 text-xs leading-5 text-[#8696a0]">{chatSearch || chatFilter !== "all" ? "Tente outro termo ou filtro." : "As novas mensagens recebidas aparecerão aqui."}</p></div>}
            <ul>
              {chats.data?.map((chat) => {
                const lastMessage = chat.messages[0];
                const title = chat.lead?.name ?? contactPhone(chat.remoteJid);
                return (
                  <li key={chat.id} className={`border-b border-[#202c33] px-2 py-1 ${selectedChat === chat.id ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setSelectedChat(chat.id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                        <span className="flex items-center gap-3">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#263c49] text-sm font-bold text-[#53bdeb]">{title.slice(0, 1).toLocaleUpperCase("pt-BR") || <UserRound size={19} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="block truncate text-sm font-semibold text-[#e9edef]">{title}</span>
                                {chat.isPinned && <Pin size={11} className="shrink-0 text-[#aebac1]" aria-label="Conversa fixada" />}
                                {chat.isStarred && <Star size={11} className="shrink-0 fill-current text-amber-400" aria-label="Conversa favorita" />}
                                {chat.isMuted && <BellOff size={11} className="shrink-0 text-[#8696a0]" aria-label="Conversa silenciada" />}
                              </span>
                              <span className="shrink-0 text-[10px] text-[#8696a0]">{timeLabel(lastMessage?.createdAt ?? chat.updatedAt)}</span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2">
                              <span className="block truncate text-[11px] text-[#aebac1]">{lastMessage?.content ?? "Sem mensagens"}</span>
                              {chat._count.messages > 0 && <span className="shrink-0 rounded-full bg-[#00a884] px-1.5 py-0.5 text-[9px] font-bold text-[#111b21]">{chat._count.messages}</span>}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button type="button" title={chat.isPinned ? "Desafixar conversa" : "Fixar conversa"} aria-label={chat.isPinned ? "Desafixar conversa" : "Fixar conversa"} onClick={() => updateChat.mutate({ chatId: chat.id, preference: { isPinned: !chat.isPinned } })} className="rounded p-1.5 text-[#8696a0] hover:bg-[#2a3942] hover:text-white">
                          <Pin size={12} />
                        </button>
                        <button type="button" title={chat.isStarred ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-label={chat.isStarred ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => updateChat.mutate({ chatId: chat.id, preference: { isStarred: !chat.isStarred } })} className={`rounded p-1.5 hover:bg-[#2a3942] ${chat.isStarred ? "text-amber-400" : "text-[#8696a0] hover:text-white"}`}>
                          <Star size={12} className={chat.isStarred ? "fill-current" : ""} />
                        </button>
                        <button type="button" title={chat.isMuted ? "Ativar notificações" : "Silenciar conversa"} aria-label={chat.isMuted ? "Ativar notificações" : "Silenciar conversa"} onClick={() => updateChat.mutate({ chatId: chat.id, preference: { isMuted: !chat.isMuted } })} className="rounded p-1.5 text-[#8696a0] hover:bg-[#2a3942] hover:text-white">
                          <BellOff size={12} />
                        </button>
                        <button type="button" title={chat.isArchived ? "Desarquivar conversa" : "Arquivar conversa"} aria-label={chat.isArchived ? "Desarquivar conversa" : "Arquivar conversa"} onClick={() => updateChat.mutate({ chatId: chat.id, preference: { isArchived: !chat.isArchived } })} className="rounded p-1.5 text-[#8696a0] hover:bg-[#2a3942] hover:text-white">
                          {chat.isArchived ? <Check size={12} /> : <Archive size={12} />}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section aria-label="Mensagens" className={`${selectedChat ? "flex" : "hidden"} min-h-0 flex-col bg-[#0b141a] md:flex`}>
          {activeChat ? (
            <>
              <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-[#2a3942] bg-[#202c33] px-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" className="rounded-full p-2 text-[#aebac1] hover:bg-[#2a3942] md:hidden" aria-label="Voltar às conversas" onClick={() => setSelectedChat(null)}><ArrowLeft size={18} /></button>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#263c49] text-sm font-bold text-[#53bdeb]">{(activeChat.lead?.name ?? contactPhone(activeChat.remoteJid)).slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-[#e9edef]">{activeChat.lead?.name ?? contactPhone(activeChat.remoteJid)}</h2>
                    <p className="mt-0.5 truncate text-[11px] text-[#aebac1]">{activeChat.lead?.phone ?? contactPhone(activeChat.remoteJid)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {activeChat.lead && <Link className="rounded-lg px-2.5 py-2 text-[10px] font-semibold text-[#aebac1] hover:bg-[#2a3942] hover:text-white sm:text-xs" to="/admin/funil">Ver no funil</Link>}
                  <button type="button" title={activeChat.isStarred ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-label={activeChat.isStarred ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => updateChat.mutate({ chatId: activeChat.id, preference: { isStarred: !activeChat.isStarred } })} className={`rounded-full p-2 transition hover:bg-[#2a3942] ${activeChat.isStarred ? "text-amber-400" : "text-[#aebac1] hover:text-white"}`}><Star size={18} className={activeChat.isStarred ? "fill-current" : ""} /></button>
                  <button type="button" title={activeChat.isArchived ? "Desarquivar conversa" : "Arquivar conversa"} aria-label={activeChat.isArchived ? "Desarquivar conversa" : "Arquivar conversa"} onClick={() => updateChat.mutate({ chatId: activeChat.id, preference: { isArchived: !activeChat.isArchived } })} className="rounded-full p-2 text-[#aebac1] transition hover:bg-[#2a3942] hover:text-white">{activeChat.isArchived ? <Check size={18} /> : <Archive size={18} />}</button>
                </div>
              </header>
              <div className="whatsapp-wallpaper flex-1 space-y-2 overflow-y-auto px-3 py-5 sm:px-6 lg:px-10">
                {messages.isLoading && <p className="text-center text-xs text-[#aebac1]">Carregando mensagens...</p>}
                {messages.isError && <p className="rounded-xl bg-red-950/70 p-3 text-xs text-red-200" role="alert">{errorMessage(messages.error)}</p>}
                {messages.data?.map((message) => (
                  <div key={message.id} className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
                    <article className={`max-w-[88%] min-w-32 whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[13px] leading-[1.4] shadow-sm sm:max-w-[75%] ${message.fromMe ? "rounded-tr-sm bg-[#005c4b] text-[#e9edef]" : "rounded-tl-sm bg-[#202c33] text-[#e9edef]"}`}>
                      {message.quotedContent && <p className="mb-2 border-l-2 border-[#00a884] pl-2 text-xs text-[#aebac1]">{message.quotedContent}</p>}
                      {message.mediaType && !message.isDeleted && <MessageMedia chatId={activeChat.id} message={message} />}
                      <p>{message.content}</p>
                      {message.reaction && <span className="mt-1 inline-block rounded-full bg-[#111b21] px-2 py-0.5 text-xs shadow">{message.reaction}</span>}
                      <p className="mt-1 text-right text-[9px] text-[#aebac1]">{timeLabel(message.createdAt)}{message.fromMe ? ` · ${message.status}` : ""}</p>
                      {!message.isDeleted && (
                        <div className="mt-1 flex items-center justify-end gap-1 border-t border-white/10 pt-1">
                          <button type="button" aria-label="Responder a esta mensagem" title="Responder" onClick={() => setReplyTo(message)} className="rounded p-1 text-[#aebac1] hover:bg-white/10 hover:text-white"><Reply size={13} /></button>
                          <button type="button" aria-label="Encaminhar mensagem" title="Encaminhar" onClick={() => { setForwardingMessage(message); setForwardTarget(""); }} className="rounded p-1 text-[#aebac1] hover:bg-white/10 hover:text-white"><Forward size={13} /></button>
                          {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                            <button key={emoji} type="button" aria-label={`Reagir com ${emoji}`} title={`Reagir com ${emoji}`} onClick={() => react.mutate({ messageId: message.id, reaction: message.reaction === emoji ? "" : emoji })} className="rounded px-0.5 text-xs hover:bg-white/10">{emoji}</button>
                          ))}
                          {message.fromMe && !message.mediaType && !message.isDeleted && (
                            <button type="button" aria-label="Editar mensagem" title="Editar" onClick={() => {
                              const content = window.prompt("Edite a mensagem:", message.content);
                              if (content?.trim() && content.trim() !== message.content) editMessage.mutate({ messageId: message.id, content: content.trim() });
                            }} className="rounded p-1 text-[#aebac1] hover:bg-white/10 hover:text-white"><Pencil size={13} /></button>
                          )}
                          {message.fromMe && !message.isDeleted && (
                            <button type="button" aria-label="Apagar mensagem para todos" title="Apagar para todos" onClick={() => {
                              if (window.confirm("Apagar esta mensagem para todos?")) deleteMessage.mutate(message.id);
                            }} className="rounded p-1 text-[#aebac1] hover:bg-red-950 hover:text-red-200"><Trash2 size={13} /></button>
                          )}
                        </div>
                      )}
                    </article>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form className="border-t border-[#202c33] bg-[#202c33] p-2.5 sm:px-4 sm:py-3" onSubmit={(event) => {
                event.preventDefault();
                if (text.trim() && !send.isPending && !sendMedia.isPending) send.mutate();
              }}>
                {forwardingMessage && <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#111b21] p-2 text-xs">
                  <span className="font-bold">Encaminhar:</span>
                  <span className="max-w-40 truncate text-[#aebac1]">{forwardingMessage.content}</span>
                  <select className="min-w-40 flex-1 rounded-lg border border-[#2a3942] bg-[#202c33] px-2 py-1.5 text-[#e9edef]" aria-label="Conversa de destino" value={forwardTarget} onChange={(event) => setForwardTarget(event.target.value)}>
                    <option value="">Selecione a conversa</option>
                    {chats.data?.filter((chat) => chat.id !== selectedChat).map((chat) => (
                      <option key={chat.id} value={chat.id}>{chat.lead?.name ?? contactPhone(chat.remoteJid)}</option>
                    ))}
                  </select>
                  <Button type="button" size="small" className="!bg-[#00a884] !text-white hover:!bg-[#06cf9c]" onClick={() => forwardMessage.mutate()} disabled={!forwardTarget || forwardMessage.isPending || !isConnected}>
                    {forwardMessage.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Forward size={14} />} Reencaminhar
                  </Button>
                  <button type="button" aria-label="Cancelar encaminhamento" onClick={() => setForwardingMessage(null)}><X size={14} /></button>
                </div>}
                {replyTo && <div className="mb-2 flex items-center justify-between rounded-lg bg-[#111b21] px-3 py-2 text-xs"><span className="truncate"><span className="font-bold">Respondendo:</span> {replyTo.content}</span><button type="button" aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}><X size={14} /></button></div>}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,video/mp4,audio/ogg,audio/mpeg,audio/mp4,application/pdf,text/plain,.doc,.docx,.xls,.xlsx"
                    onChange={onFileSelected}
                  />
                  <button type="button" aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => fileInputRef.current?.click()} disabled={!isConnected || sendMedia.isPending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#aebac1] transition hover:bg-[#2a3942] hover:text-white disabled:opacity-50">
                    {sendMedia.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Paperclip size={19} />}
                  </button>
                  <textarea className="max-h-32 min-h-10 flex-1 resize-y rounded-lg bg-[#2a3942] px-3 py-2.5 text-[13px] text-[#e9edef] outline-none placeholder:text-[#8696a0] focus:ring-1 focus:ring-[#00a884]" aria-label="Mensagem ou legenda" placeholder="Digite uma mensagem" maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} />
                  <Button type="submit" aria-label="Enviar mensagem" className="!h-10 !min-h-10 !w-10 !shrink-0 !rounded-full !bg-[#00a884] !p-0 !text-white hover:!bg-[#06cf9c]" disabled={!text.trim() || send.isPending || sendMedia.isPending || !isConnected}>
                    {send.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                  </Button>
                </div>
                {send.isError && <p className="mt-2 px-2 text-xs text-red-300" role="alert">{errorMessage(send.error)}</p>}
              </form>
            </>
          ) : (
            <div className="whatsapp-wallpaper hidden flex-1 flex-col items-center justify-center p-8 text-center md:flex">
              <MessageCircle className="text-[#8696a0]" size={36} />
              <p className="mt-4 text-lg font-light text-[#e9edef]">Mantenha seu celular conectado</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-[#8696a0]">Selecione uma conversa para enviar e receber mensagens pelo WhatsApp.</p>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
