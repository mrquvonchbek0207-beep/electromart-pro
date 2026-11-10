import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BadgePercent,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  FileSpreadsheet,
  LoaderCircle,
  LogOut,
  Mail,
  MessageCircle,
  Newspaper,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Localized, currencyLabel, formatPrice, priceFromCurrency, priceInCurrency } from "./i18n.js";
import { API_BASE } from "./api.js";

const CATEGORIES = [
  "Холодильники",
  "Стиральные машины",
  "Телевизоры",
  "Пылесосы",
  "Кухонная техника",
  "Климатическая техника",
];
const ORDER_STATUSES = ["Новый", "В обработке", "Доставляется", "Выполнен"];
const getLocale = () => {
  try {
    return ({ uz: "uz-UZ", en: "en-US" })[window.localStorage.getItem("electromart-language")] || "ru-RU";
  } catch {
    return "ru-RU";
  }
};
async function requestJson(path, options = {}, adminToken = "", onUnauthorized = () => {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Admin-Token", adminToken);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    if (response.status === 401) onUnauthorized();
    const detail = typeof body === "object" ? body?.detail : body;
    throw new Error(detail || `Ошибка сервера (${response.status}).`);
  }
  return body;
}

function localDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getLocale(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function parseOrderItems(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

function chatClientKey(message) {
  return message.client_id || `legacy:${message.client_name}`;
}

function emptyProduct() {
  return {
    sku: "",
    name: "",
    category: CATEGORIES[0],
    brand: "",
    price: "",
    old_price: "",
    discount_percent: 0,
    stock_count: 0,
    rating: 4.5,
    specs: "",
    image_url: "",
    is_promo: false,
  };
}

function emptyPromotion() {
  return {
    title: "",
    subtitle: "",
    discount_text: "",
    end_date: "",
    banner_color: "#2563eb",
  };
}

function emptyNews() {
  return { title: "", summary: "", content: "", date: new Date().toISOString().slice(0, 10), image_url: "" };
}

function AdminPanel({
  initialProducts,
  onProductsChange,
  onPromotionsChange,
  onNewsChange,
  notify,
  language,
  adminToken,
  onUnauthorized,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [news, setNews] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [drafts, setDrafts] = useState({});
  const [priceInputs, setPriceInputs] = useState({});
  const [savingProductId, setSavingProductId] = useState(null);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const productFormCurrencyLanguage = useRef(language);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [promotionForm, setPromotionForm] = useState(emptyPromotion);
  const [newsForm, setNewsForm] = useState(emptyNews);
  const [promotionSubmitting, setPromotionSubmitting] = useState(false);
  const [newsSubmitting, setNewsSubmitting] = useState(false);
  const [deletingContentId, setDeletingContentId] = useState(null);
  const [supportReply, setSupportReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [activeClient, setActiveClient] = useState("");
  const [chatError, setChatError] = useState("");
  const uploadInput = useRef(null);
  const chatPolling = useRef(false);
  const adminRequest = useCallback(
    (path, options = {}) => requestJson(path, options, adminToken, onUnauthorized),
    [adminToken, onUnauthorized],
  );

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setResourceError("");
    const resources = [
      ["/api/orders", setOrders, null, "заказы"],
      ["/api/promotions", setPromotions, onPromotionsChange, "акции"],
      ["/api/news", setNews, onNewsChange, "новости"],
      ["/api/chat", setMessages, null, "сообщения"],
    ];
    const errors = [];
    await Promise.all(
      resources.map(async ([path, setter, parentSetter, name]) => {
        try {
          const data = await adminRequest(path);
          if (!Array.isArray(data)) throw new Error(`Сервер вернул неверный формат: ${name}.`);
          setter(data);
          parentSetter?.(data);
        } catch (error) {
          errors.push(`${name}: ${error.message}`);
        }
      }),
    );
    if (errors.length) setResourceError(errors.join(" "));
    setLoading(false);
    setRefreshing(false);
  }, [adminRequest, onNewsChange, onPromotionsChange]);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let mounted = true;
    async function refreshChat() {
      if (chatPolling.current) return;
      chatPolling.current = true;
      try {
        const data = await adminRequest("/api/chat");
        if (!Array.isArray(data)) throw new Error("Сервер вернул неверный формат сообщений.");
        if (mounted) {
          setMessages(data);
          setChatError("");
        }
      } catch (error) {
        if (mounted) setChatError(error.message);
      } finally {
        chatPolling.current = false;
      }
    }
    refreshChat();
    const timer = window.setInterval(refreshChat, 3000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [adminRequest]);

  useEffect(() => {
    setDrafts((current) => {
      const next = {};
      for (const product of products) {
        next[product.id] = current[product.id] || {
          price: product.price,
          discount_percent: product.discount_percent,
          stock_count: product.stock_count,
        };
      }
      return next;
    });
  }, [language, products]);

  useEffect(() => {
    setPriceInputs(Object.fromEntries(
      products.map((product) => [product.id, String(priceInCurrency(product.price, language))]),
    ));
  }, [language, products]);

  useEffect(() => {
    const previousLanguage = productFormCurrencyLanguage.current;
    if (previousLanguage !== language) {
      setProductForm((current) => ({
        ...current,
        price: current.price === "" ? "" : String(priceInCurrency(priceFromCurrency(current.price, previousLanguage), language)),
        old_price: current.old_price === "" ? "" : String(priceInCurrency(priceFromCurrency(current.old_price, previousLanguage), language)),
      }));
      productFormCurrencyLanguage.current = language;
    }
  }, [language]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setProductModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("ru");
    return products.filter((product) => {
      const matchesCategory = !productCategory || product.category === productCategory;
      const text = `${product.name} ${product.brand} ${product.sku}`.toLocaleLowerCase("ru");
      return matchesCategory && (!query || text.includes(query));
    });
  }, [productCategory, productSearch, products]);
  const unreadMessages = messages.filter((message) => message.sender === "client" && !message.is_read);
  const activePromotionsCount = promotions.filter((promotion) => {
    const end = new Date(/^\d{4}-\d{2}-\d{2}$/.test(promotion.end_date) ? `${promotion.end_date}T23:59:59` : promotion.end_date);
    return !Number.isNaN(end.getTime()) && end.getTime() >= Date.now();
  }).length;
  const revenue = orders.reduce((sum, order) => sum + (Number(order.total_price) || 0), 0);
  const selectedClientMessages = messages.filter((message) => chatClientKey(message) === activeClient);

  useEffect(() => {
    const clients = [...new Set(messages.map(chatClientKey))];
    if (!activeClient || !clients.includes(activeClient)) {
      const unreadClient = unreadMessages[0] ? chatClientKey(unreadMessages[0]) : "";
      setActiveClient(unreadClient || clients.at(-1) || "");
    }
  }, [activeClient, messages, unreadMessages]);

  function updateProductDraft(productId, field, value) {
    if (field === "price") {
      setPriceInputs((current) => ({ ...current, [productId]: value }));
      return;
    }
    setDrafts((current) => ({
      ...current,
      [productId]: { ...current[productId], [field]: value },
    }));
  }

  async function saveProduct(product) {
    const draft = drafts[product.id];
    if (!draft) return;
    const values = {
      price: priceFromCurrency(priceInputs[product.id] ?? draft.price, language),
      discount_percent: Number(draft.discount_percent),
      stock_count: Number(draft.stock_count),
    };
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
      notify("Цена, скидка и остаток должны быть неотрицательными числами.", "error");
      return;
    }
    if (values.discount_percent > 100) {
      notify("Скидка не может превышать 100%.", "error");
      return;
    }
    setSavingProductId(product.id);
    try {
      const updated = await adminRequest(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setProducts((current) => current.map((item) => item.id === product.id ? updated : item));
      onProductsChange((current) => current.map((item) => item.id === product.id ? updated : item));
      setPriceInputs((current) => ({ ...current, [updated.id]: String(priceInCurrency(updated.price, language)) }));
      setDrafts((current) => ({
        ...current,
        [updated.id]: { price: updated.price, discount_percent: updated.discount_percent, stock_count: updated.stock_count },
      }));
      notify(`Товар «${updated.name}» сохранён.`);
    } catch (error) {
      notify(`Не удалось сохранить товар: ${error.message}`, "error");
    } finally {
      setSavingProductId(null);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Удалить товар «${product.name}»? Это действие нельзя отменить.`)) return;
    setDeletingProductId(product.id);
    try {
      await adminRequest(`/api/products/${product.id}`, { method: "DELETE" });
      const nextProducts = products.filter((item) => item.id !== product.id);
      setProducts(nextProducts);
      onProductsChange(nextProducts);
      notify(`Товар «${product.name}» удалён.`);
    } catch (error) {
      notify(`Не удалось удалить товар: ${error.message}`, "error");
    } finally {
      setDeletingProductId(null);
    }
  }

  async function uploadSpreadsheet(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      notify("Выберите файл .xlsx или .xls.", "error");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const result = await adminRequest("/api/products/upload-excel", {
        method: "POST",
        body: formData,
      });
      const updatedProducts = await adminRequest("/api/products");
      if (!Array.isArray(updatedProducts)) throw new Error("Сервер вернул неверный формат товаров.");
      setProducts(updatedProducts);
      onProductsChange(updatedProducts);
      await loadData(true);
      notify(`Импорт завершён: добавлено ${result.added}, обновлено ${result.updated} товаров.`);
    } catch (error) {
      notify(`Не удалось импортировать файл: ${error.message}`, "error");
    } finally {
      setUploading(false);
      if (uploadInput.current) uploadInput.current.value = "";
      setDragging(false);
    }
  }

  async function exportSpreadsheet() {
    setExporting(true);
    try {
      const response = await fetch(`${API_BASE}/api/products/export-excel`, {
        headers: { "X-Admin-Token": adminToken },
      });
      if (response.status === 401) onUnauthorized();
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        const detail = typeof body === "object" ? body?.detail : body;
        throw new Error(detail || `Ошибка сервера (${response.status}).`);
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "electromart_products.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      notify(`Не удалось экспортировать товары: ${error.message}`, "error");
    } finally {
      setExporting(false);
    }
  }

  async function submitProduct(event) {
    event.preventDefault();
    const payload = {
      ...productForm,
      price: priceFromCurrency(productForm.price, language),
      old_price: priceFromCurrency(productForm.old_price || 0, language),
      discount_percent: Number(productForm.discount_percent || 0),
      stock_count: Number(productForm.stock_count || 0),
      rating: Number(productForm.rating || 0),
      in_stock: Number(productForm.stock_count || 0) > 0,
    };
    setProductSubmitting(true);
    try {
      const created = await adminRequest("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const nextProducts = [...products, created];
      setProducts(nextProducts);
      onProductsChange(nextProducts);
      setProductForm(emptyProduct());
      setProductModalOpen(false);
      notify("Новый товар добавлен в каталог.");
    } catch (error) {
      notify(`Не удалось добавить товар: ${error.message}`, "error");
    } finally {
      setProductSubmitting(false);
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      const updated = await adminRequest(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setOrders((current) => current.map((order) => order.id === orderId ? updated : order));
      notify(`Статус заказа №${orderId} изменён.`);
    } catch (error) {
      notify(`Не удалось изменить статус заказа: ${error.message}`, "error");
    }
  }

  async function submitPromotion(event) {
    event.preventDefault();
    setPromotionSubmitting(true);
    try {
      const created = await adminRequest("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promotionForm),
      });
      const nextPromotions = [...promotions, created];
      setPromotions(nextPromotions);
      onPromotionsChange(nextPromotions);
      setPromotionForm(emptyPromotion());
      notify("Акция опубликована.");
    } catch (error) {
      notify(`Не удалось добавить акцию: ${error.message}`, "error");
    } finally {
      setPromotionSubmitting(false);
    }
  }

  async function submitNews(event) {
    event.preventDefault();
    setNewsSubmitting(true);
    try {
      const created = await adminRequest("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newsForm),
      });
      const nextNews = [...news, created].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setNews(nextNews);
      onNewsChange(nextNews);
      setNewsForm(emptyNews());
      notify("Статья опубликована.");
    } catch (error) {
      notify(`Не удалось добавить статью: ${error.message}`, "error");
    } finally {
      setNewsSubmitting(false);
    }
  }

  async function deleteContent(type, item) {
    const isPromotion = type === "promotions";
    const label = isPromotion ? "акцию" : "статью";
    if (!window.confirm(`Удалить ${label} «${item.title}»?`)) return;
    setDeletingContentId(`${type}-${item.id}`);
    try {
      await adminRequest(`/api/${type}/${item.id}`, { method: "DELETE" });
      if (isPromotion) {
        const nextPromotions = promotions.filter((entry) => entry.id !== item.id);
        setPromotions(nextPromotions);
        onPromotionsChange(nextPromotions);
      } else {
        const nextNews = news.filter((entry) => entry.id !== item.id);
        setNews(nextNews);
        onNewsChange(nextNews);
      }
      notify(`${isPromotion ? "Акция" : "Статья"} удалена.`);
    } catch (error) {
      notify(`Не удалось удалить ${label}: ${error.message}`, "error");
    } finally {
      setDeletingContentId(null);
    }
  }

  async function markMessagesRead(ids) {
    try {
      await adminRequest("/api/chat/mark-read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setMessages((current) => current.map((message) =>
        ids.includes(message.id) ? { ...message, is_read: true } : message,
      ));
      notify("Сообщения отмечены как прочитанные.");
    } catch (error) {
      notify(`Не удалось отметить сообщения: ${error.message}`, "error");
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    if (!activeClient || !supportReply.trim()) return;
    setSendingReply(true);
    try {
      const reply = await adminRequest("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: "admin",
          client_name: selectedClientMessages[0]?.client_name || "Покупатель",
          client_id: selectedClientMessages[0]?.client_id || null,
          message: supportReply.trim(),
        }),
      });
      setMessages((current) => [...current, reply]);
      setSupportReply("");
      notify("Ответ отправлен.");
    } catch (error) {
      notify(`Не удалось отправить ответ: ${error.message}`, "error");
    } finally {
      setSendingReply(false);
    }
  }

  const tabs = [
    { id: "products", label: "Товары и Excel", icon: Package },
    { id: "orders", label: "Заказы клиентов", icon: ClipboardList, count: orders.length },
    { id: "content", label: "Акции и новости", icon: Newspaper },
    { id: "support", label: "Чат поддержки", icon: MessageCircle, count: unreadMessages.length },
  ];

  return (
    <Localized>
    <main className="admin-page page-width">
      <style>{adminStyles}</style>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow"><ShieldCheck size={14} /> РАБОЧЕЕ МЕСТО МЕНЕДЖЕРА</span>
          <h1>Панель управления</h1>
          <p>Управляйте товарами, заказами и контентом магазина ElectroMart Pro.</p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-refresh" onClick={() => loadData(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "admin-spin" : ""} />
            Обновить данные
          </button>
          <button className="admin-logout" onClick={onLogout}>
            <LogOut size={14} /> Выйти
          </button>
        </div>
      </div>

      {resourceError && (
        <div className="admin-error-banner" role="alert">
          <CircleAlert size={17} />
          <span>{resourceError}</span>
          <button onClick={() => loadData(true)}>Повторить</button>
        </div>
      )}

      <section className="admin-kpis" aria-label="Основные показатели магазина">
        <KpiCard icon={Package} label="Товаров в базе" value={loading ? "…" : products.length} note="Каталог ElectroMart" tone="blue" />
        <KpiCard icon={BadgePercent} label="Активные акции" value={loading ? "…" : activePromotionsCount} note="Предложения для покупателей" tone="violet" />
        <KpiCard icon={Banknote} label="Заказы и выручка" value={loading ? "…" : orders.length} note={`${formatPrice(revenue, language)} · Общая сумма`} tone="green" />
        <button className="admin-kpi admin-kpi-clickable" onClick={() => { setActiveTab("support"); const message = unreadMessages[0] || messages.at(-1); setActiveClient(message ? chatClientKey(message) : ""); }}>
          <span className="kpi-icon kpi-orange"><MessageCircle size={19} /></span>
          <span className="kpi-copy"><span>Непрочитанные сообщения</span><strong>{loading ? "…" : unreadMessages.length}</strong><small>Открыть центр поддержки <ArrowRight size={12} /></small></span>
          {unreadMessages.length > 0 && <span className="kpi-alert-dot" />}
        </button>
      </section>

      <div className="admin-tab-bar" role="tablist" aria-label="Разделы панели управления">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            className={`admin-tab ${activeTab === id ? "admin-tab-active" : ""}`}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} /> {label}
            {id === "orders" && <span className="admin-tab-count">{count}</span>}
            {id === "support" && count > 0 && <span className="admin-tab-count">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === "products" && (
        <section className="admin-panel-card">
          <div className="admin-panel-title">
            <div>
              <span className="admin-eyebrow">КАТАЛОГ И СКЛАД</span>
              <h2>Управление товарами и Excel импорт</h2>
              <p>Обновляйте цены и остатки, загружайте каталог массово или добавляйте товары вручную.</p>
            </div>
            <button className="admin-primary-button" onClick={() => { setProductForm(emptyProduct()); setProductModalOpen(true); }}>
              <Plus size={16} /> Добавить товар вручную
            </button>
          </div>

          <div
            className={`excel-toolbar ${dragging ? "excel-toolbar-dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); uploadSpreadsheet(event.dataTransfer.files[0]); }}
          >
            <div className="excel-toolbar-icon"><FileSpreadsheet size={22} /></div>
            <div className="excel-toolbar-copy">
              <strong>Массовая загрузка каталога</strong>
              <span>Перетащите файл сюда или выберите таблицу .xlsx / .xls</span>
            </div>
            <input
              ref={uploadInput}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              hidden
              onChange={(event) => uploadSpreadsheet(event.target.files?.[0])}
            />
            <button className="excel-upload-button" onClick={() => uploadInput.current?.click()} disabled={uploading}>
              {uploading ? <LoaderCircle size={16} className="admin-spin" /> : <Upload size={16} />}
              {uploading ? "Загрузка файла…" : "Загрузить товары из Excel (.xlsx / .xls)"}
            </button>
            <div className="excel-divider" />
            <a className="excel-download-button" href={`${API_BASE}/api/products/template-excel`} download>
              <ArrowDownToLine size={15} /> Скачать шаблон Excel
            </a>
            <button className="excel-download-button excel-export-button" onClick={exportSpreadsheet} disabled={exporting}>
              {exporting ? <LoaderCircle size={15} className="admin-spin" /> : <ArrowDownToLine size={15} />}
              {exporting ? "Подготовка файла…" : "Экспорт базы в Excel"}
            </button>
          </div>

          <div className="admin-table-tools">
            <div className="admin-table-title"><strong>Товары</strong><span>{filteredProducts.length} из {products.length}</span></div>
            <div className="admin-table-filters">
              <label className="admin-search"><Search size={15} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Поиск по названию, бренду или SKU" /></label>
              <label className="admin-select-wrap">
                <select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>
                  <option value="">Все категории</option>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
          </div>

          {loading && products.length === 0 ? <AdminLoading label="Загружаем каталог…" /> : (
            <div className="admin-table-scroll">
              <table className="admin-table product-admin-table">
                <thead><tr>
                  <th>Товар</th><th>Артикул</th><th>Цена, {currencyLabel(language)}</th><th>Скидка, %</th><th>Остаток, шт.</th><th>Действия</th>
                </tr></thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const draft = drafts[product.id] || product;
                    const changed = priceFromCurrency(priceInputs[product.id] ?? priceInCurrency(product.price, language), language) !== Number(product.price) ||
                      Number(draft.discount_percent) !== Number(product.discount_percent) ||
                      Number(draft.stock_count) !== Number(product.stock_count);
                    return (
                      <tr key={product.id}>
                        <td><div className="table-product-name"><strong>{product.name}</strong><small>{product.brand} · {product.category}</small></div></td>
                        <td><span className="sku-chip">{product.sku}</span></td>
                        <td><input aria-label={`Цена товара ${product.name}`} className="table-number-input" type="number" min="0" value={priceInputs[product.id] ?? priceInCurrency(product.price, language)} onChange={(event) => updateProductDraft(product.id, "price", event.target.value)} /></td>
                        <td><div className="discount-input-wrap"><input aria-label={`Скидка товара ${product.name}`} className="table-number-input discount-number-input" type="number" min="0" max="100" value={draft.discount_percent} onChange={(event) => updateProductDraft(product.id, "discount_percent", event.target.value)} /><span>%</span></div></td>
                        <td><input aria-label={`Остаток товара ${product.name}`} className="table-number-input stock-number-input" type="number" min="0" value={draft.stock_count} onChange={(event) => updateProductDraft(product.id, "stock_count", event.target.value)} /></td>
                        <td><div className="table-row-actions">
                          <button className="row-save-button" disabled={!changed || savingProductId === product.id} onClick={() => saveProduct(product)}>
                            {savingProductId === product.id ? <LoaderCircle size={13} className="admin-spin" /> : <Check size={13} />} Сохранить
                          </button>
                          <button className="row-delete-button" aria-label={`Удалить ${product.name}`} disabled={deletingProductId === product.id} onClick={() => deleteProduct(product)}>
                            {deletingProductId === product.id ? <LoaderCircle size={14} className="admin-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div></td>
                      </tr>
                    );
                  })}
                  {!loading && filteredProducts.length === 0 && <tr><td className="admin-table-empty" colSpan="6">Товары по заданным условиям не найдены.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "orders" && (
        <section className="admin-panel-card">
          <div className="admin-panel-title">
            <div>
              <span className="admin-eyebrow">ПРОДАЖИ И ДОСТАВКА</span>
              <h2>Заказы клиентов</h2>
              <p>Отслеживайте заказы и обновляйте их статус по мере обработки.</p>
            </div>
            <span className="orders-total-chip"><ClipboardList size={15} /> {orders.length} заказов · {formatPrice(revenue, language)}</span>
          </div>
          {loading && orders.length === 0 ? <AdminLoading label="Загружаем заказы…" /> : orders.length === 0 ? (
            <AdminEmpty icon={ClipboardList} title="Заказов пока нет" detail="Новые заказы покупателей появятся в этом списке." />
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table orders-admin-table">
                <thead><tr>
                  <th>Заказ</th><th>Покупатель</th><th>Товары</th><th>Сумма</th><th>Дата</th><th>Статус</th>
                </tr></thead>
                <tbody>
                  {[...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((order) => {
                    const items = parseOrderItems(order.items_json);
                    return (
                      <tr key={order.id}>
                        <td><span className="order-id">№{order.id}</span></td>
                        <td><div className="order-customer"><strong>{order.customer_name}</strong><a href={`tel:${order.phone}`}><PhoneIcon /> {order.phone}</a><small>{order.address}</small></div></td>
                        <td><div className="ordered-items">{items.length ? items.map((item, index) => <span key={`${item.sku || item.name}-${index}`}>{item.name || item.sku || "Товар"} <b>×{item.quantity || 1}</b></span>) : <span>Подробности заказа</span>}</div></td>
                        <td><strong className="order-sum">{formatPrice(order.total_price, language)}</strong></td>
                        <td><span className="order-date">{localDate(order.created_at)}</span></td>
                        <td><label className={`order-status-select status-${statusClass(order.status)}`}><select aria-label={`Статус заказа ${order.id}`} value={ORDER_STATUSES.includes(order.status) ? order.status : "Новый"} onChange={(event) => updateOrderStatus(order.id, event.target.value)}>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><ChevronDown size={13} /></label></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === "content" && (
        <section className="content-admin-grid">
          <div className="admin-panel-card content-form-card">
            <div className="admin-panel-title compact-admin-title">
              <div><span className="admin-eyebrow">ПРЕДЛОЖЕНИЯ МАГАЗИНА</span><h2><Tag size={18} /> Акции</h2><p>Создавайте предложения, которые увидят покупатели.</p></div>
            </div>
            <form className="admin-content-form" onSubmit={submitPromotion}>
              <label>Название акции<input required maxLength={240} value={promotionForm.title} onChange={(event) => setPromotionForm({ ...promotionForm, title: event.target.value })} placeholder="Например, Большая распродажа" /></label>
              <label>Краткое описание<input required maxLength={500} value={promotionForm.subtitle} onChange={(event) => setPromotionForm({ ...promotionForm, subtitle: event.target.value })} placeholder="Что получит покупатель" /></label>
              <div className="admin-form-row">
                <label>Размер скидки<input required maxLength={100} value={promotionForm.discount_text} onChange={(event) => setPromotionForm({ ...promotionForm, discount_text: event.target.value })} placeholder="до −30%" /></label>
                <label>Дата окончания<input required type="date" value={promotionForm.end_date} onChange={(event) => setPromotionForm({ ...promotionForm, end_date: event.target.value })} /></label>
              </div>
              <label className="color-input-label">Цвет баннера<input type="color" value={promotionForm.banner_color} onChange={(event) => setPromotionForm({ ...promotionForm, banner_color: event.target.value })} /></label>
              <button className="admin-primary-button full-admin-button" type="submit" disabled={promotionSubmitting}>{promotionSubmitting ? <LoaderCircle size={15} className="admin-spin" /> : <Plus size={15} />} Опубликовать акцию</button>
            </form>
            <div className="content-list-heading"><strong>Опубликованные акции</strong><span>{promotions.length}</span></div>
            <div className="managed-content-list">
              {promotions.map((promotion) => (
                <div className="managed-content-item" key={promotion.id}>
                  <span className="promotion-color-chip" style={{ background: promotion.banner_color || "#3265df" }} />
                  <span className="managed-content-copy"><strong>{promotion.title}</strong><small>{promotion.discount_text} · до {promotion.end_date}</small></span>
                  <button className="row-delete-button" aria-label={`Удалить акцию ${promotion.title}`} disabled={deletingContentId === `promotions-${promotion.id}`} onClick={() => deleteContent("promotions", promotion)}>{deletingContentId === `promotions-${promotion.id}` ? <LoaderCircle size={14} className="admin-spin" /> : <Trash2 size={14} />}</button>
                </div>
              ))}
              {promotions.length === 0 && <p className="managed-empty">Акций пока нет.</p>}
            </div>
          </div>

          <div className="admin-panel-card content-form-card">
            <div className="admin-panel-title compact-admin-title">
              <div><span className="admin-eyebrow">ЖУРНАЛ ELECTROMART</span><h2><Newspaper size={18} /> Новости и статьи</h2><p>Публикуйте советы, обзоры и новости магазина.</p></div>
            </div>
            <form className="admin-content-form" onSubmit={submitNews}>
              <label>Заголовок<input required maxLength={240} value={newsForm.title} onChange={(event) => setNewsForm({ ...newsForm, title: event.target.value })} placeholder="Заголовок статьи" /></label>
              <label>Краткое описание<textarea required maxLength={1000} rows="2" value={newsForm.summary} onChange={(event) => setNewsForm({ ...newsForm, summary: event.target.value })} placeholder="Короткий анонс для карточки" /></label>
              <label>Полный текст<textarea required rows="4" value={newsForm.content} onChange={(event) => setNewsForm({ ...newsForm, content: event.target.value })} placeholder="Полный текст статьи" /></label>
              <div className="admin-form-row">
                <label>Дата публикации<input required type="date" value={newsForm.date} onChange={(event) => setNewsForm({ ...newsForm, date: event.target.value })} /></label>
                <label>Ссылка на изображение<input required type="url" value={newsForm.image_url} onChange={(event) => setNewsForm({ ...newsForm, image_url: event.target.value })} placeholder="https://…" /></label>
              </div>
              <button className="admin-primary-button full-admin-button" type="submit" disabled={newsSubmitting}>{newsSubmitting ? <LoaderCircle size={15} className="admin-spin" /> : <Plus size={15} />} Опубликовать статью</button>
            </form>
            <div className="content-list-heading"><strong>Опубликованные статьи</strong><span>{news.length}</span></div>
            <div className="managed-content-list">
              {news.map((article) => (
                <div className="managed-content-item" key={article.id}>
                  <span className="managed-news-icon"><Newspaper size={15} /></span>
                  <span className="managed-content-copy"><strong>{article.title}</strong><small>{article.date} · {article.summary}</small></span>
                  <button className="row-delete-button" aria-label={`Удалить статью ${article.title}`} disabled={deletingContentId === `news-${article.id}`} onClick={() => deleteContent("news", article)}>{deletingContentId === `news-${article.id}` ? <LoaderCircle size={14} className="admin-spin" /> : <Trash2 size={14} />}</button>
                </div>
              ))}
              {news.length === 0 && <p className="managed-empty">Статей пока нет.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "support" && (
        <section className="admin-panel-card support-inbox-card">
          <div className="admin-panel-title">
            <div>
              <span className="admin-eyebrow">ОБРАТНАЯ СВЯЗЬ · ОБНОВЛЕНИЕ КАЖДЫЕ 3 СЕКУНДЫ</span>
              <h2><MessageCircle size={18} /> Чат поддержки</h2>
              <p>Все обращения покупателей, ответы оператора и статус прочтения сообщений.</p>
            </div>
            <button className="admin-secondary-button" onClick={async () => {
              try {
                const data = await adminRequest("/api/chat");
                if (!Array.isArray(data)) throw new Error("Сервер вернул неверный формат сообщений.");
                setMessages(data);
                setChatError("");
              } catch (error) {
                setChatError(error.message);
              }
            }}><RefreshCw size={14} /> Обновить чат</button>
          </div>
          {chatError && <div className="admin-error-banner chat-error-banner" role="alert"><CircleAlert size={16} /><span>Не удалось обновить чат: {chatError}</span></div>}
          {messages.length === 0 ? <AdminEmpty icon={Mail} title="Сообщений пока нет" detail="Сообщения покупателей появятся в этом списке." /> : (
            <div className="support-layout">
              <div className="support-client-list">
                {[...new Set(messages.map(chatClientKey))].map((client) => {
                  const clientMessages = messages.filter((message) => chatClientKey(message) === client);
                  const clientUnread = clientMessages.filter((message) => message.sender === "client" && !message.is_read).length;
                  const lastMessage = clientMessages.at(-1);
                  const clientName = clientMessages[0]?.client_name || "Покупатель";
                  return <button className={`support-client ${activeClient === client ? "support-client-active" : ""}`} key={client} onClick={() => setActiveClient(client)}><span className="support-avatar">{clientName.slice(0, 1).toLocaleUpperCase("ru")}</span><span><strong>{clientName}</strong><small>{lastMessage?.message}</small></span>{clientUnread > 0 && <b>{clientUnread}</b>}</button>;
                })}
              </div>
              <div className="support-conversation">
                <div className="support-messages">
                  {selectedClientMessages.map((message) => (
                    <div className={`support-message ${message.sender === "admin" ? "support-message-admin" : ""}`} key={message.id}>
                      <span className="support-message-sender">{message.sender === "admin" ? "Менеджер" : message.client_name}</span>
                      <p>{message.message}</p><small>{localDate(message.created_at)}{message.is_read ? " · Прочитано" : " · Новое"}</small>
                    </div>
                  ))}
                  {selectedClientMessages.length === 0 && <p className="managed-empty">Выберите диалог.</p>}
                </div>
                <div className="support-actions">
                  {selectedClientMessages.some((message) => message.sender === "client" && !message.is_read) && <button className="admin-secondary-button" onClick={() => markMessagesRead(selectedClientMessages.filter((message) => message.sender === "client" && !message.is_read).map((message) => message.id))}><Check size={14} /> Отметить прочитанным</button>}
                  <form className="support-reply-form" onSubmit={submitReply}><input value={supportReply} onChange={(event) => setSupportReply(event.target.value)} placeholder="Напишите ответ покупателю" disabled={!activeClient} /><button type="submit" aria-label="Отправить ответ" disabled={!activeClient || !supportReply.trim() || sendingReply}>{sendingReply ? <LoaderCircle size={16} className="admin-spin" /> : <Send size={16} />}</button></form>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {productModalOpen && (
        <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setProductModalOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-label="Добавить товар">
            <div className="admin-modal-heading"><div><span className="admin-eyebrow">НОВАЯ ПОЗИЦИЯ</span><h2>Добавить товар вручную</h2></div><button className="admin-close-button" aria-label="Закрыть" onClick={() => setProductModalOpen(false)}><X size={19} /></button></div>
            <form className="admin-product-form" onSubmit={submitProduct}>
              <div className="admin-form-row">
                <label>Артикул (SKU)<input required maxLength={80} value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
                <label>Бренд<input required maxLength={100} value={productForm.brand} onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })} /></label>
              </div>
              <label>Название товара<input required maxLength={240} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
              <div className="admin-form-row">
                <label>Категория<select required value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label>Цена, {currencyLabel(language)}<input required type="number" min="0" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
              </div>
              <div className="admin-form-row admin-form-row-three">
                <label>Старая цена, {currencyLabel(language)}<input type="number" min="0" value={productForm.old_price} onChange={(event) => setProductForm({ ...productForm, old_price: event.target.value })} /></label>
                <label>Скидка, %<input type="number" min="0" max="100" value={productForm.discount_percent} onChange={(event) => setProductForm({ ...productForm, discount_percent: event.target.value })} /></label>
                <label>Остаток, шт.<input type="number" min="0" value={productForm.stock_count} onChange={(event) => setProductForm({ ...productForm, stock_count: event.target.value })} /></label>
              </div>
              <div className="admin-form-row">
                <label>Рейтинг<input type="number" min="0" max="5" step="0.1" value={productForm.rating} onChange={(event) => setProductForm({ ...productForm, rating: event.target.value })} /></label>
                <label>Ссылка на изображение<input type="url" value={productForm.image_url} onChange={(event) => setProductForm({ ...productForm, image_url: event.target.value })} placeholder="https://…" /></label>
              </div>
              <label>Характеристики<textarea rows="3" value={productForm.specs} onChange={(event) => setProductForm({ ...productForm, specs: event.target.value })} /></label>
              <label className="admin-checkbox-label"><input type="checkbox" checked={productForm.is_promo} onChange={(event) => setProductForm({ ...productForm, is_promo: event.target.checked })} /> Участвует в акции</label>
              <div className="admin-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setProductModalOpen(false)}>Отмена</button><button type="submit" className="admin-primary-button" disabled={productSubmitting}>{productSubmitting ? <LoaderCircle size={15} className="admin-spin" /> : <Plus size={15} />} Добавить товар</button></div>
            </form>
          </section>
        </div>
      )}

    </main>
    </Localized>
  );
}

function statusClass(status) {
  if (status === "Выполнен") return "done";
  if (status === "Доставляется") return "shipping";
  if (status === "В обработке") return "processing";
  return "new";
}

function KpiCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="admin-kpi">
      <span className={`kpi-icon kpi-${tone}`}><Icon size={19} /></span>
      <span className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></span>
    </div>
  );
}

function AdminLoading({ label }) {
  return <div className="admin-loading"><LoaderCircle size={19} className="admin-spin" /> {label}</div>;
}

function AdminEmpty({ icon: Icon, title, detail }) {
  return <div className="admin-empty"><span><Icon size={22} /></span><strong>{title}</strong><small>{detail}</small></div>;
}

function PhoneIcon() {
  return <span aria-hidden="true">☎</span>;
}

const adminStyles = `
  .admin-page{min-height:calc(100vh - 190px);padding-top:30px;padding-bottom:48px;color:#1d2b45}
  .admin-page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:22px}
  .admin-header-actions{display:flex;align-items:center;gap:8px}
  .admin-logout{height:36px;display:flex;align-items:center;gap:6px;padding:0 10px;border:1px solid #f0dadd;border-radius:8px;background:#fff8f8;color:#ad4b55;font-size:9px;font-weight:650}
  .admin-logout:hover{border-color:#e6b9bf;background:#fff1f2}
  .admin-eyebrow{display:flex;align-items:center;gap:6px;color:#3667db;font-size:8px;font-weight:800;letter-spacing:1.25px}
  .admin-page-heading h1{margin:8px 0 5px;color:#1b2b49;font-size:27px;line-height:1.2;letter-spacing:-.8px}
  .admin-page-heading p,.admin-panel-title p{margin:0;color:#8490a4;font-size:9px;line-height:1.7}
  .admin-refresh{height:36px;display:flex;align-items:center;gap:7px;padding:0 12px;border:1px solid #e0e6f0;border-radius:8px;background:white;color:#52617a;font-size:9px;font-weight:600}
  .admin-refresh:hover{border-color:#b6c8ef;color:#2a5bd4}
  .admin-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}
  .admin-kpi{position:relative;min-width:0;min-height:102px;display:flex;align-items:flex-start;gap:12px;padding:16px;border:1px solid #e7ebf2;border-radius:12px;background:white;text-align:left}
  .admin-kpi-clickable{width:100%;font:inherit;cursor:pointer;transition:.18s}
  .admin-kpi-clickable:hover{border-color:#c8d6f3;box-shadow:0 6px 16px #1c31520b;transform:translateY(-1px)}
  .kpi-icon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:10px}
  .kpi-blue{color:#3567de;background:#edf3ff}.kpi-violet{color:#8261d3;background:#f3efff}.kpi-green{color:#139b6c;background:#eaf8f1}.kpi-orange{color:#df8e32;background:#fff4e8}
  .kpi-copy{min-width:0;display:grid;gap:4px}
  .kpi-copy>span{overflow:hidden;color:#77849a;font-size:8px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
  .kpi-copy>strong{color:#21314e;font-size:22px;line-height:1.1;letter-spacing:-.6px}
  .kpi-copy>small{display:flex;align-items:center;gap:4px;overflow:hidden;color:#9aa4b4;font-size:7px;text-overflow:ellipsis;white-space:nowrap}
  .kpi-copy>small svg{color:#4e72ce}
  .kpi-alert-dot{position:absolute;right:14px;top:15px;width:7px;height:7px;border-radius:50%;background:#ef5266;box-shadow:0 0 0 4px #ef52661c}
  .admin-tab-bar{display:flex;gap:5px;margin-bottom:14px;padding:5px;border:1px solid #e7ebf2;border-radius:10px;background:#edf0f6;width:max-content;max-width:100%;overflow-x:auto}
  .admin-tab{height:34px;display:flex;align-items:center;gap:7px;padding:0 12px;border:0;border-radius:7px;background:transparent;color:#738097;font-size:9px;font-weight:700;white-space:nowrap}
  .admin-tab:hover{color:#315dcc}.admin-tab-active{background:white;color:#2859d2;box-shadow:0 2px 6px #1c2d4d12}
  .admin-tab-count{display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:6px;background:#f0f3f8;color:#7e899c;font-size:8px}
  .admin-tab-active .admin-tab-count{background:#edf3ff;color:#3262d2}
  .admin-panel-card{min-width:0;padding:19px;border:1px solid #e7ebf2;border-radius:13px;background:white;box-shadow:0 4px 12px #1b2b4605}
  .admin-panel-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
  .admin-panel-title h2{margin:6px 0 4px;color:#243450;font-size:16px;letter-spacing:-.35px}
  .admin-primary-button{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 12px;border:0;border-radius:8px;background:#2c60df;color:white;font-size:9px;font-weight:700;white-space:nowrap;box-shadow:0 4px 10px #2c60df22}
  .admin-primary-button:hover:not(:disabled){background:#214fc4}
  .admin-secondary-button{min-height:32px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid #dfe5ef;border-radius:7px;background:white;color:#586780;font-size:8px;font-weight:600}
  .excel-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:17px;padding:13px;border:1px dashed #cbd7ec;border-radius:10px;background:#f8faff;transition:.18s}
  .excel-toolbar-dragging{border-color:#3267e5;background:#eff4ff;box-shadow:0 0 0 3px #3267e512}
  .excel-toolbar-icon{width:37px;height:37px;flex:0 0 37px;display:grid;place-items:center;border-radius:10px;background:#eaf1ff;color:#3268dc}
  .excel-toolbar-copy{min-width:190px;flex:1;display:grid;gap:4px}
  .excel-toolbar-copy strong{color:#33435e;font-size:9px}.excel-toolbar-copy span{color:#8a96aa;font-size:8px}
  .excel-upload-button{min-height:33px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:0;border-radius:7px;background:#2e61df;color:white;font-size:8px;font-weight:700}
  .excel-upload-button:hover:not(:disabled){background:#204ec4}
  .excel-divider{height:26px;width:1px;background:#e1e7f0}
  .excel-download-button{min-height:31px;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0 8px;border:1px solid #e0e6ef;border-radius:7px;background:white;color:#52617a;font-size:8px;font-weight:600;white-space:nowrap}
  .excel-download-button:hover{border-color:#b8c9ef;color:#285acb}
  .excel-export-button{color:#17835e}
  .admin-table-tools{display:flex;align-items:center;justify-content:space-between;gap:13px;margin:0 0 10px}
  .admin-table-title{display:flex;align-items:center;gap:8px;white-space:nowrap}
  .admin-table-title strong{color:#34425a;font-size:10px}.admin-table-title span{padding:3px 6px;border-radius:5px;background:#f0f3f8;color:#7e899c;font-size:8px}
  .admin-table-filters{display:flex;justify-content:flex-end;gap:8px;flex:1}
  .admin-search,.admin-select-wrap{position:relative;min-height:32px;display:flex;align-items:center;gap:6px;padding:0 9px;border:1px solid #e4e9f1;border-radius:7px;background:#fff;color:#8b96a8}
  .admin-search{width:min(310px,100%)}
  .admin-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#33415a;font-size:8px}
  .admin-search input::placeholder{color:#a1aaba}
  .admin-select-wrap select{appearance:none;min-width:130px;padding:0 17px 0 0;border:0;outline:0;background:transparent;color:#56637a;font-size:8px}
  .admin-select-wrap svg{position:absolute;right:7px;pointer-events:none}
  .admin-table-scroll{width:100%;overflow:auto}
  .admin-table{width:100%;border-collapse:separate;border-spacing:0;white-space:nowrap}
  .admin-table th{height:34px;padding:0 9px;border-top:1px solid #edf0f5;border-bottom:1px solid #edf0f5;background:#f9fafc;color:#8994a7;text-align:left;font-size:7px;font-weight:700}
  .admin-table th:first-child{border-radius:7px 0 0 7px}.admin-table th:last-child{border-radius:0 7px 7px 0}
  .admin-table td{height:56px;padding:7px 9px;border-bottom:1px solid #f0f2f6;color:#4b5970;font-size:8px}
  .table-product-name{max-width:245px;display:grid;gap:4px;white-space:normal}
  .table-product-name strong{display:-webkit-box;overflow:hidden;-webkit-line-clamp:1;-webkit-box-orient:vertical;color:#35435c;font-size:8px;line-height:1.5}
  .table-product-name small{color:#929daf;font-size:7px}
  .sku-chip{padding:4px 6px;border:1px solid #e9edf3;border-radius:5px;background:#fafbfd;color:#6b7890;font-size:7px}
  .table-number-input{width:82px;height:29px;padding:0 7px;border:1px solid #e1e6ef;border-radius:6px;outline:none;color:#34425b;font-size:8px}
  .table-number-input:focus{border-color:#91acf0;box-shadow:0 0 0 2px #2c63e711}
  .discount-input-wrap{position:relative;width:68px}.discount-number-input{width:100%;padding-right:19px}.discount-input-wrap>span{position:absolute;right:7px;top:8px;color:#8792a5;font-size:8px;pointer-events:none}
  .stock-number-input{width:67px}
  .table-row-actions{display:flex;align-items:center;gap:5px}
  .row-save-button{height:28px;display:flex;align-items:center;gap:4px;padding:0 7px;border:1px solid #dceade;border-radius:6px;background:#f2faf4;color:#378053;font-size:7px;font-weight:700}
  .row-save-button:not(:disabled):hover{background:#e5f6e9}
  .row-delete-button{width:28px;height:28px;display:grid;place-items:center;border:1px solid #f0e2e4;border-radius:6px;background:#fffafb;color:#d16470}
  .row-delete-button:hover:not(:disabled){background:#fff0f1}
  .admin-table-empty{height:90px!important;text-align:center;color:#8c97a9!important}
  .admin-loading,.admin-empty{min-height:200px;display:flex;align-items:center;justify-content:center;gap:9px;color:#8490a4;font-size:9px}
  .admin-empty{flex-direction:column;text-align:center}
  .admin-empty>span{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:#f0f4fc;color:#6682c5}
  .admin-empty strong{color:#42516a;font-size:10px}.admin-empty small{color:#8b96a8;font-size:8px}
  .admin-spin{animation:admin-rotate .8s linear infinite}
  @keyframes admin-rotate{to{transform:rotate(360deg)}}
  .orders-total-chip{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #e5eaf2;border-radius:7px;color:#61718b;font-size:8px;white-space:nowrap}
  .orders-admin-table th,.orders-admin-table td{padding-left:10px;padding-right:10px}
  .order-id{color:#3262d6;font-size:9px;font-weight:800}
  .order-customer{min-width:135px;display:grid;gap:4px}
  .order-customer strong{color:#39475e;font-size:8px}
  .order-customer a{color:#52709f;font-size:7px}
  .order-customer a span{margin-right:3px}
  .order-customer small{max-width:160px;overflow:hidden;color:#8a95a7;font-size:7px;text-overflow:ellipsis}
  .ordered-items{max-width:190px;display:grid;gap:4px;white-space:normal}
  .ordered-items span{color:#617087;font-size:7px;line-height:1.5}
  .ordered-items b{color:#33435d;white-space:nowrap}
  .order-sum{color:#253651;font-size:9px}
  .order-date{color:#748197;font-size:7px}
  .order-status-select{position:relative;display:flex;align-items:center}
  .order-status-select select{appearance:none;max-width:110px;padding:7px 20px 7px 8px;border:1px solid transparent;border-radius:6px;outline:0;background:#f2f5fa;color:#66738a;font-size:7px;font-weight:700}
  .order-status-select>svg{position:absolute;right:5px;pointer-events:none}
  .status-new select{background:#fff6e8;color:#b27620}.status-processing select{background:#eef4ff;color:#3b68c6}.status-shipping select{background:#f2efff;color:#795bbd}.status-done select{background:#eaf8f0;color:#278359}
  .content-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;align-items:start}
  .content-form-card{padding:16px}
  .compact-admin-title{margin-bottom:13px}
  .compact-admin-title h2{display:flex;align-items:center;gap:7px;font-size:14px}
  .compact-admin-title h2 svg{color:#3667d7}
  .admin-content-form,.admin-product-form{display:grid;gap:9px}
  .admin-content-form label,.admin-product-form label{display:grid;gap:5px;color:#52617a;font-size:8px;font-weight:700}
  .admin-content-form input,.admin-content-form textarea,.admin-product-form input,.admin-product-form textarea,.admin-product-form select,.admin-content-form input[type=date]{width:100%;min-height:34px;padding:8px 9px;border:1px solid #e2e7ef;border-radius:7px;outline:none;background:white;color:#33425b;font-size:8px}
  .admin-content-form textarea,.admin-product-form textarea{resize:vertical;line-height:1.6}
  .admin-content-form input:focus,.admin-content-form textarea:focus,.admin-product-form input:focus,.admin-product-form textarea:focus,.admin-product-form select:focus{border-color:#92acf0;box-shadow:0 0 0 2px #3267e510}
  .admin-content-form input::placeholder,.admin-content-form textarea::placeholder,.admin-product-form input::placeholder{color:#a4adba}
  .admin-form-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .admin-form-row-three{grid-template-columns:repeat(3,minmax(0,1fr))}
  .admin-content-form .color-input-label{grid-template-columns:1fr auto;align-items:center}
  .color-input-label input{width:38px!important;height:28px;min-height:28px!important;padding:2px!important}
  .full-admin-button{width:100%;min-height:35px}
  .content-list-heading{display:flex;align-items:center;justify-content:space-between;margin:19px 0 7px;padding-top:12px;border-top:1px solid #edf0f5}
  .content-list-heading strong{color:#526079;font-size:8px}.content-list-heading span{color:#8994a7;font-size:8px}
  .managed-content-list{display:grid}
  .managed-content-item{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #f0f2f6}
  .promotion-color-chip{width:11px;height:30px;flex:0 0 11px;border-radius:5px}
  .managed-news-icon{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;border-radius:8px;background:#eef3ff;color:#4f70c1}
  .managed-content-copy{min-width:0;flex:1;display:grid;gap:4px}
  .managed-content-copy strong{overflow:hidden;color:#3c4a62;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
  .managed-content-copy small{overflow:hidden;color:#8b96a8;font-size:7px;text-overflow:ellipsis;white-space:nowrap}
  .managed-empty{padding:9px 0;color:#8b96a8;font-size:8px}
  .admin-modal-backdrop{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:#14213bb8;backdrop-filter:blur(4px)}
  .admin-modal{width:min(620px,100%);max-height:90vh;overflow:auto;border-radius:14px;background:white;box-shadow:0 24px 80px #06112c45}
  .admin-modal-heading{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:15px 19px;border-bottom:1px solid #edf0f5;background:white}
  .admin-modal-heading h2{display:flex;align-items:center;gap:7px;margin:5px 0 0;color:#293852;font-size:14px}
  .admin-modal-heading h2 svg{color:#3969d5}
  .admin-close-button{width:31px;height:31px;display:grid;place-items:center;border:1px solid #e4e8ef;border-radius:7px;background:white;color:#6f7d93}
  .admin-product-form{padding:17px 19px}
  .admin-checkbox-label{display:flex!important;align-items:center;gap:7px!important}
  .admin-checkbox-label input{width:14px!important;min-height:14px!important;accent-color:#2d60db}
  .admin-modal-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
  .support-inbox-card .admin-panel-title h2{display:flex;align-items:center;gap:7px}
  .support-inbox-card .admin-panel-title h2 svg{color:#3969d5}
  .chat-error-banner{margin-bottom:13px}
  .support-layout{min-height:440px;display:grid;grid-template-columns:240px minmax(0,1fr);border:1px solid #edf0f5;border-radius:9px;overflow:hidden}
  .support-client-list{max-height:520px;overflow:auto;border-right:1px solid #edf0f5}
  .support-client{width:100%;display:flex;align-items:center;gap:8px;padding:11px;border:0;border-bottom:1px solid #f0f2f6;background:white;text-align:left}
  .support-client:hover,.support-client-active{background:#f6f8fd}
  .support-avatar{width:31px;height:31px;flex:0 0 31px;display:grid;place-items:center;border-radius:50%;background:#eaf0ff;color:#3866ce;font-size:10px;font-weight:800}
  .support-client>span:nth-child(2){min-width:0;flex:1;display:grid;gap:4px}
  .support-client strong{overflow:hidden;color:#34425a;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
  .support-client small{overflow:hidden;color:#8b96a8;font-size:7px;text-overflow:ellipsis;white-space:nowrap}
  .support-client>b{min-width:17px;height:17px;display:grid;place-items:center;padding:0 4px;border-radius:99px;background:#e94f66;color:white;font-size:7px}
  .support-conversation{min-width:0;display:flex;flex-direction:column}
  .support-messages{flex:1;min-height:340px;max-height:520px;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:13px}
  .support-message{max-width:80%;align-self:flex-start;padding:9px 10px;border:1px solid #e8ebf2;border-radius:9px 9px 9px 2px;background:#fafbfc}
  .support-message-admin{align-self:flex-end;border-color:#dbe5ff;border-radius:9px 9px 2px 9px;background:#f1f5ff}
  .support-message-sender{color:#4266b5;font-size:7px;font-weight:700}
  .support-message p{margin:5px 0;color:#43516a;font-size:8px;line-height:1.65;white-space:pre-wrap}
  .support-message small{color:#919bae;font-size:6px}
  .support-actions{display:grid;gap:8px;padding:10px;border-top:1px solid #edf0f5}
  .support-actions>.admin-secondary-button{justify-self:start}
  .support-reply-form{display:flex;gap:6px}
  .support-reply-form input{height:34px;min-width:0;flex:1;padding:0 9px;border:1px solid #e2e7ef;border-radius:7px;outline:0;font-size:8px}
  .support-reply-form input:focus{border-color:#92acf0}
  .support-reply-form button{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:7px;background:#2d60dc;color:white}
  .admin-error-banner{display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:10px 12px;border:1px solid #f1d8da;border-radius:8px;background:#fff7f7;color:#b9505a;font-size:8px;line-height:1.6}
  .admin-error-banner svg{flex:0 0 auto}
  .admin-error-banner span{flex:1}
  .admin-error-banner button{border:0;background:transparent;color:#a33e49;font-size:8px;font-weight:700}
  @media(max-width:1050px){.admin-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.excel-toolbar-copy{min-width:150px}.content-admin-grid{grid-template-columns:1fr}.admin-panel-card{padding:15px}}
  @media(max-width:700px){.admin-page{padding-top:21px}.admin-page-heading{align-items:flex-start}.admin-page-heading h1{font-size:23px}.admin-page-heading p{max-width:430px}.admin-refresh{padding:0 8px;font-size:8px}.admin-kpis{gap:8px}.admin-kpi{min-height:86px;padding:11px;gap:8px}.kpi-icon{width:30px;height:30px;flex-basis:30px}.kpi-copy>span{font-size:7px}.kpi-copy>strong{font-size:19px}.admin-tab{padding:0 9px;font-size:8px}.excel-toolbar{gap:8px}.excel-toolbar-copy{flex-basis:calc(100% - 55px)}.excel-upload-button{flex:1}.excel-divider{display:none}.excel-download-button{flex:1}.admin-table-tools{align-items:flex-start;flex-direction:column}.admin-table-filters{width:100%;justify-content:stretch}.admin-search{flex:1}.admin-select-wrap select{min-width:105px}.admin-panel-title h2{font-size:14px}.admin-panel-title{align-items:flex-start;flex-direction:column}.orders-total-chip{align-self:flex-start}.support-layout{grid-template-columns:155px minmax(0,1fr)}.support-client{padding:8px 6px;gap:5px}.support-avatar{width:25px;height:25px;flex-basis:25px}.support-client strong{font-size:7px}.support-client small{font-size:6px}.support-messages{padding:8px}.support-message{max-width:94%}}
  @media(max-width:480px){.admin-page-heading{gap:8px;flex-direction:column}.admin-header-actions{width:100%;justify-content:flex-start}.admin-refresh,.admin-logout{align-self:flex-start;padding:0 8px;font-size:8px}.admin-kpi{min-height:79px;gap:6px;padding:9px}.kpi-icon{width:26px;height:26px;flex-basis:26px}.kpi-icon svg{width:15px}.kpi-copy>span{font-size:6px}.kpi-copy>strong{font-size:17px}.kpi-copy>small{font-size:6px}.admin-tab-bar{width:100%}.admin-tab{flex:1;justify-content:center;gap:4px;padding:0 5px;font-size:7px}.admin-panel-card{padding:11px}.admin-panel-title h2{font-size:12px}.admin-panel-title p{font-size:8px}.excel-toolbar-copy span{font-size:7px}.excel-upload-button,.excel-download-button{font-size:7px}.admin-form-row-three{grid-template-columns:repeat(3,minmax(0,1fr))}.admin-modal-backdrop{padding:10px}.admin-modal{max-height:94vh}.support-layout{min-height:420px;grid-template-columns:112px minmax(0,1fr)}.support-client-list{max-height:420px;overflow:auto}.support-client{align-items:flex-start;flex-wrap:wrap}.support-client>span:nth-child(2){width:calc(100% - 34px);flex:none}.support-client>b{margin-left:31px}.support-client small{max-width:75px}.support-actions{padding:7px}.admin-modal-heading h2{font-size:12px}.admin-product-form{padding:12px}.admin-content-form label,.admin-product-form label{font-size:7px}}
`;

export default AdminPanel;
