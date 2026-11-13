import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Headphones, LoaderCircle, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { Localized } from "./i18n.js";
import { API_URL } from "./api.js";

const NAME_KEY = "electromart-support-name";
const CLIENT_ID_KEY = "electromart-support-client-id";
const LAST_SEEN_KEY = "electromart-support-last-seen";
const QUICK_QUESTIONS = [
  "Какая гарантия на технику?",
  "Условия доставки и подъема?",
  "Как оформить рассрочку?",
];

function getStoredValue(key, fallback = "") {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function getOrCreateClientId() {
  const saved = getStoredValue(CLIENT_ID_KEY);
  if (saved) return saved;
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const clientId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  try {
    window.localStorage.setItem(CLIENT_ID_KEY, clientId);
  } catch (error) {
    console.error("Не удалось сохранить идентификатор чата:", error);
  }
  return clientId;
}

function chatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(
        ({ uz: "uz-UZ", en: "en-US" })[getStoredValue("electromart-language")] || "ru-RU",
        { hour: "2-digit", minute: "2-digit" },
      ).format(date);
}

export default function CustomerSupportChat() {
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(() => getStoredValue(NAME_KEY));
  const [clientId] = useState(getOrCreateClientId);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastSeenId, setLastSeenId] = useState(() =>
    Number(getStoredValue(LAST_SEEN_KEY, "0")) || 0,
  );
  const [fallbackClientName, setFallbackClientName] = useState("");
  const conversationRef = useRef(null);
  const requestInProgress = useRef(false);

  const effectiveName = clientName.trim() || fallbackClientName;
  const ownMessages = useMemo(
    () => messages.filter((message) => message.client_name === effectiveName),
    [effectiveName, messages],
  );
  const unreadCount = ownMessages.filter(
    (message) => message.sender === "admin" && message.id > lastSeenId,
  ).length;

  useEffect(() => {
    if (!clientName.trim()) return;
    try {
      window.localStorage.setItem(NAME_KEY, clientName.trim());
    } catch {
      setError("Не удалось сохранить имя на этом устройстве.");
    }
  }, [clientName]);

  useEffect(() => {
    let active = true;
    const fetchMessages = async (initial = false) => {
      if (requestInProgress.current) return;
      requestInProgress.current = true;
      if (initial) setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/chat`, {
          headers: { "X-Chat-Session-ID": clientId },
        });
        if (!response.ok) throw new Error(`Ошибка сервера (${response.status}).`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Сервер вернул сообщения в неверном формате.");
        if (active) {
          setMessages(data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id));
          setError("");
        }
      } catch (fetchError) {
        if (active) setError(`Не удалось подключиться к чату: ${fetchError.message}`);
      } finally {
        requestInProgress.current = false;
        if (active && initial) setLoading(false);
      }
    };

    fetchMessages(true);
    const interval = window.setInterval(() => fetchMessages(), 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [clientId]);

  useEffect(() => {
    if (!open || ownMessages.length === 0) return;
    const latestAdminMessage = ownMessages
      .filter((message) => message.sender === "admin")
      .reduce((latest, message) => Math.max(latest, message.id), lastSeenId);
    if (latestAdminMessage > lastSeenId) {
      setLastSeenId(latestAdminMessage);
      try {
        window.localStorage.setItem(LAST_SEEN_KEY, String(latestAdminMessage));
      } catch {
        setError("Не удалось сохранить статус прочтения на этом устройстве.");
      }
    }
  }, [lastSeenId, open, ownMessages]);

  useEffect(() => {
    if (!open || !conversationRef.current) return;
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [open, ownMessages]);

  async function sendMessage(messageText) {
    const text = messageText.trim();
    if (!text || sending) return;
    let name = clientName.trim();
    if (!name) {
      name = "Покупатель";
      setFallbackClientName(name);
      setClientName(name);
    }
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "client", client_name: name, client_id: clientId, message: text }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Ошибка сервера (${response.status}).`);
      }
      const created = await response.json();
      setMessages((current) => [...current.filter((item) => item.id !== created.id), created]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id));
      setDraft("");
      setError("");
    } catch (sendError) {
      setError(`Не удалось отправить сообщение: ${sendError.message}`);
    } finally {
      setSending(false);
    }
  }

  function submitMessage(event) {
    event.preventDefault();
    sendMessage(draft);
  }

  return (
    <Localized>
    <div className="customer-chat-root">
      {open && (
        <section className="customer-chat-window" role="dialog" aria-modal="false" aria-label="Чат с поддержкой">
          <div className="customer-chat-header">
            <span className="customer-chat-avatar"><Headphones size={19} /></span>
            <span className="customer-chat-heading">
              <strong>Чат с поддержкой</strong>
              <small><i /> Обычно отвечаем быстро</small>
            </span>
            <button className="customer-chat-close" onClick={() => setOpen(false)} aria-label="Закрыть чат">
              <X size={18} />
            </button>
          </div>

          <div className="customer-chat-questions">
            <span>Быстрые вопросы</span>
            {QUICK_QUESTIONS.map((question) => (
              <button key={question} onClick={() => sendMessage(question)} disabled={sending}>
                {question}
              </button>
            ))}
          </div>

          <div className="customer-chat-messages" ref={conversationRef} aria-live="polite">
            <div className="customer-chat-welcome">
              <span className="customer-welcome-icon"><ShieldCheck size={17} /></span>
              <p>Здравствуйте! Напишите нам — поможем с выбором, заказом и доставкой.</p>
            </div>
            {loading && messages.length === 0 && (
              <div className="customer-chat-loading"><LoaderCircle size={16} className="customer-chat-spin" /> Подключаемся к чату…</div>
            )}
            {ownMessages.map((message) => (
              <div className={`customer-message ${message.sender === "client" ? "customer-message-own" : "customer-message-reply"}`} key={message.id}>
                {message.sender === "admin" && <small>Поддержка ElectroMart</small>}
                <p>{message.message}</p>
                <time>{chatTime(message.created_at)} {message.sender === "client" && <Check size={11} />}</time>
              </div>
            ))}
            {error && <div className="customer-chat-error" role="alert">{error}</div>}
          </div>

          <div className="customer-chat-compose">
            <label className="customer-name-label">
              <span>Ваше имя</span>
              <input
                value={clientName}
                onChange={(event) => {
                  setClientName(event.target.value);
                  setFallbackClientName("");
                }}
                maxLength={240}
                placeholder="Как к вам обращаться"
              />
            </label>
            <form onSubmit={submitMessage}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={4000}
                placeholder="Напишите сообщение…"
                aria-label="Текст сообщения"
              />
              <button type="submit" disabled={!draft.trim() || sending} aria-label="Отправить сообщение">
                {sending ? <LoaderCircle size={17} className="customer-chat-spin" /> : <Send size={17} />}
              </button>
            </form>
            <small>Имя сохраняется на этом устройстве</small>
          </div>
        </section>
      )}

      <button
        className={`customer-chat-launcher ${open ? "customer-chat-launcher-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Закрыть чат с поддержкой" : "Чат с поддержкой"}
      >
        {open ? <X size={21} /> : <MessageCircle size={21} />}
        <span className="customer-chat-launcher-label">{open ? "Закрыть чат" : "Чат с поддержкой"}</span>
        {!open && <span className="customer-chat-online" aria-label="Поддержка онлайн" />}
        {!open && unreadCount > 0 && <span className="customer-chat-unread">{unreadCount}</span>}
      </button>
    </div>
    </Localized>
  );
}
