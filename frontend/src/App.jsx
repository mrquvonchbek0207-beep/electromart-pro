import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AdminPanel from "./AdminPanel.jsx";
import CustomerSupportChat from "./CustomerSupportChat.jsx";
import ProfilePage from "./ProfilePage.jsx";
import PwaInstallButton from "./PwaInstallButton.jsx";
import {
  LanguageContext,
  LanguageSelect,
  LANGUAGE_KEY,
  Localized,
  currencyLabel,
  formatInstallment,
  formatPrice,
  localizeProductText,
  priceFromCurrency,
  priceInCurrency,
  translate,
} from "./i18n.js";
import { API_URL } from "./api.js";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock3,
  ChevronDown,
  GitCompareArrows,
  Heart,
  Headphones,
  Home,
  LayoutGrid,
  KeyRound,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Truck,
  UserRound,
  X,
  Zap,
} from "lucide-react";

const PAGE_SIZE = 12;

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function readStoredCart() {
  try {
    const stored = window.localStorage.getItem("electromart_cart");
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    const entries = Array.isArray(parsed)
      ? parsed.map((item) => [item?.product_id ?? item?.id, item?.quantity])
      : Object.entries(parsed || {});
    return Object.fromEntries(
      entries
        .map(([id, quantity]) => [String(id), Math.floor(Number(quantity))])
        .filter(([id, quantity]) => /^\d+$/.test(id) && Number(id) > 0 && Number.isInteger(quantity) && quantity > 0),
    );
  } catch (error) {
    console.error("Не удалось восстановить корзину из локального хранилища:", error);
    return {};
  }
}

function readStoredCartOwner() {
  try {
    const storedOwner = window.localStorage.getItem("electromart_cart_user_id");
    if (storedOwner) return storedOwner;
    if (window.localStorage.getItem("electromart_user_token")) {
      const savedUser = JSON.parse(window.localStorage.getItem("electromart_user") || "null");
      return savedUser?.id ? String(savedUser.id) : "";
    }
  } catch (error) {
    console.error("Не удалось восстановить владельца сохранённой корзины:", error);
  }
  return "";
}

const CATEGORIES = [
  "Все",
  "Холодильники",
  "Стиральные машины",
  "Телевизоры",
  "Пылесосы",
  "Кухонная техника",
  "Климатическая техника",
];

const SORT_OPTIONS = [
  { value: "popular", label: "По популярности" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
  { value: "discount", label: "По размеру скидки" },
];

const PHONE_COUNTRIES = [
  { id: "uz", flag: "🇺🇿", dial: "+998", label: "Uzbekistan", maxDigits: 9, format: [2, 3, 2, 2], placeholder: "(__) ___-__-__" },
  { id: "ru", flag: "🇷🇺", dial: "+7", label: "Russia", maxDigits: 10, format: [3, 3, 2, 2], placeholder: "(___) ___-__-__" },
  { id: "us", flag: "🇺🇸", dial: "+1", label: "USA / International", maxDigits: 10, format: [3, 3, 4], placeholder: "(___) ___-____" },
  { id: "kz", flag: "🇰🇿", dial: "+7", label: "Kazakhstan", maxDigits: 10, format: [3, 3, 2, 2], placeholder: "(___) ___-__-__" },
];

function defaultPhoneCountry(language) {
  return language === "uz" ? "uz" : language === "en" ? "us" : "ru";
}

function phoneWithCountryCode(countryId, digits) {
  const country = PHONE_COUNTRIES.find((item) => item.id === countryId) || PHONE_COUNTRIES[0];
  return `${country.dial}${String(digits || "").replace(/\D/g, "").slice(0, country.maxDigits)}`;
}

function formatPhoneDigits(value, country) {
  const activeCountry = country || PHONE_COUNTRIES[0];
  const digits = String(value || "").replace(/\D/g, "").slice(0, activeCountry.maxDigits);
  const groups = [];
  let offset = 0;
  for (const size of activeCountry.format) {
    if (offset >= digits.length) break;
    groups.push(digits.slice(offset, offset + size));
    offset += size;
  }
  if (!groups.length) return "";
  return activeCountry.id === "uz"
    ? `(${groups[0]}${groups.length > 1 ? `) ${groups[1]}` : ""}${groups.length > 2 ? `-${groups[2]}` : ""}${groups.length > 3 ? `-${groups[3]}` : ""}`
    : `(${groups[0]}${groups.length > 1 ? `) ${groups[1]}` : ""}${groups.length > 2 ? `-${groups[2]}` : ""}${groups.length > 3 ? `-${groups[3]}` : ""}`;
}

function PhoneField({ id, label, value, onChange, countryId, onCountryChange }) {
  const country = PHONE_COUNTRIES.find((item) => item.id === countryId) || PHONE_COUNTRIES[0];
  return (
    <label className="phone-field" htmlFor={id}>
      {label}
      <span className="phone-input-row">
        <select
          className="phone-country-select"
          aria-label="Код страны"
          value={country.id}
          onChange={(event) => {
            const nextCountry = PHONE_COUNTRIES.find((item) => item.id === event.target.value) || PHONE_COUNTRIES[0];
            onCountryChange(nextCountry.id);
            onChange(String(value || "").replace(/\D/g, "").slice(0, nextCountry.maxDigits));
          }}
        >
          {PHONE_COUNTRIES.map((item) => (
            <option key={item.id} value={item.id}>{item.flag} {item.dial}</option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={formatPhoneDigits(value, country)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, country.maxDigits))}
          placeholder={country.placeholder}
          aria-label={label}
          required
        />
      </span>
    </label>
  );
}

function ProductImage({ product, className = "" }) {
  const { language } = useContext(LanguageContext);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [product.image_url]);

  if (failed || !product.image_url) {
    return (
      <Localized>
      <div className={`product-image-fallback ${className}`} aria-label={product.localizedName || product.name}>
        <ShoppingBag size={38} strokeWidth={1.4} />
        <span>{product.localizedCategory || product.category}</span>
      </div>
      </Localized>
    );
  }

  return (
    <img
      className={className}
      src={product.image_url}
      alt={product.localizedName || translate(language, product.name)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function NewsImage({ article, className = "" }) {
  const { language } = useContext(LanguageContext);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [article.image_url]);

  if (failed || !article.image_url) {
    return (
      <Localized>
      <div className={`news-image-fallback ${className}`} aria-label={article.title}>
        <Sparkles size={28} />
        <span>ElectroMart журнал</span>
      </div>
      </Localized>
    );
  }

  return (
    <img
      className={className}
      src={article.image_url}
      alt={translate(language, article.title)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function Countdown({ endDate }) {
  const getRemaining = () => {
    if (!endDate) return 0;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    const target = new Date(dateOnly ? `${endDate}T23:59:59` : endDate).getTime();
    return Number.isNaN(target) ? 0 : Math.max(0, Math.floor((target - Date.now()) / 1000));
  };
  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    setRemaining(getRemaining());
    const timer = window.setInterval(() => setRemaining(getRemaining()), 1000);
    return () => window.clearInterval(timer);
  }, [endDate]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <Localized>
    <div className="countdown" aria-label="Время до окончания акции">
      {[
        ["ЧАСЫ", hours],
        ["МИН", minutes],
        ["СЕК", seconds],
      ].map(([label, value]) => (
        <span className="countdown-unit" key={label}>
          <strong>{String(value).padStart(2, "0")}</strong>
          <small>{label}</small>
        </span>
      ))}
    </div>
    </Localized>
  );
}

function formatArticleDate(value) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value || "";
  const locale = (() => {
    try {
      return ({ uz: "uz-UZ", en: "en-US" })[window.localStorage.getItem(LANGUAGE_KEY)] || "ru-RU";
    } catch {
      return "ru-RU";
    }
  })();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <Localized>
    <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`} role="status">
      {toast.type === "error" ? <X size={18} /> : <Check size={18} />}
      <span>{toast.message}</span>
      <button className="toast-close" aria-label="Закрыть уведомление" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
    </Localized>
  );
}

function App() {
  const [language, setLanguage] = useState(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_KEY);
      return ["uz", "ru", "en"].includes(saved) ? saved : "ru";
    } catch {
      return "ru";
    }
  });
  const [products, setProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [promotionsError, setPromotionsError] = useState("");
  const [news, setNews] = useState([]);
  const [newsError, setNewsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [section, setSection] = useState(() => window.location.pathname === "/admin" ? "admin" : "store");
  const [activeMobileTab, setActiveMobileTab] = useState("home");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Все");
  const [brand, setBrand] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [discountOnly, setDiscountOnly] = useState(false);
  const [sortBy, setSortBy] = useState("popular");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [comparedIds, setComparedIds] = useState([]);
  const [cart, setCart] = useState(readStoredCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("При получении");
  const [checkoutConfirmation, setCheckoutConfirmation] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [quickProduct, setQuickProduct] = useState(null);
  const [quickPhone, setQuickPhone] = useState("");
  const [quickPhoneCountry, setQuickPhoneCountry] = useState(() => defaultPhoneCountry(language));
  const [quickName, setQuickName] = useState("");
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutPhoneCountry, setCheckoutPhoneCountry] = useState(() => defaultPhoneCountry(language));
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false);
  const filterCurrencyLanguage = useRef(language);
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return window.localStorage.getItem("admin_token") || window.localStorage.getItem("electromart-admin-token") || "";
    } catch {
      return "";
    }
  });
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminLoginSubmitting, setAdminLoginSubmitting] = useState(false);
  const [customerToken, setCustomerToken] = useState(() => {
    try {
      return window.localStorage.getItem("electromart_user_token") || "";
    } catch {
      return "";
    }
  });
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = window.localStorage.getItem("electromart_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [customerLoginOpen, setCustomerLoginOpen] = useState(false);
  const [customerAuthMode, setCustomerAuthMode] = useState("login");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerAuthError, setCustomerAuthError] = useState("");
  const [customerAuthSubmitting, setCustomerAuthSubmitting] = useState(false);
  const [cartSyncRetry, setCartSyncRetry] = useState(0);
  const cartRef = useRef(cart);
  const cartSyncReady = useRef(!customerToken);
  const cartSyncQueue = useRef(Promise.resolve());
  const currentCustomerToken = useRef(customerToken);
  const currentCustomerId = useRef(customer?.id ? String(customer.id) : "");
  const cartOwnerId = useRef(readStoredCartOwner());
  const currentLanguage = useRef(language);
  const cartMergeGeneration = useRef(0);
  currentCustomerToken.current = customerToken;
  currentCustomerId.current = customer?.id ? String(customer.id) : "";
  currentLanguage.current = language;

  const updateCart = useCallback((update) => {
    const next = typeof update === "function" ? update(cartRef.current) : update;
    const normalized = next && typeof next === "object" && !Array.isArray(next) ? next : {};
    cartRef.current = normalized;
    setCart(normalized);
    try {
      window.localStorage.setItem("electromart_cart", JSON.stringify(normalized));
    } catch (error) {
      console.error("Не удалось сохранить корзину в локальном хранилище:", error);
    }
  }, []);

  const clearCustomerSession = useCallback(() => {
    try {
      window.localStorage.removeItem("electromart_user_token");
      window.localStorage.removeItem("electromart_user");
    } catch (error) {
      console.error("Не удалось удалить локальный сеанс покупателя:", error);
    }
    setCustomerToken("");
    setCustomer(null);
    cartSyncReady.current = false;
  }, []);

  const queueCartSync = useCallback((token, snapshot, ownerId = currentCustomerId.current) => {
    const operation = cartSyncQueue.current
      .catch((error) => {
        console.error("Предыдущая синхронизация корзины завершилась ошибкой:", error);
      })
      .then(async () => {
        if (!token || token !== currentCustomerToken.current) return;
        const items = Object.entries(snapshot)
          .map(([productId, quantity]) => ({
            product_id: Number(productId),
            quantity: Math.floor(Number(quantity)),
          }))
          .filter((item) => Number.isInteger(item.product_id) && item.product_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
        const response = await fetch(`${API_URL}/api/users/me/cart`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(items),
        });
        if (response.status === 401 || response.status === 403) {
          clearCustomerSession();
          throw new Error(translate(currentLanguage.current, "Сеанс покупателя завершён. Войдите снова."));
        }
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.detail || `Cart synchronization failed (${response.status}).`);
        }
        if (ownerId && token === currentCustomerToken.current) {
          cartOwnerId.current = String(ownerId);
          try {
            window.localStorage.setItem("electromart_cart_user_id", String(ownerId));
          } catch (error) {
            console.error("Не удалось сохранить владельца синхронизированной корзины:", error);
          }
        }
        return response.json();
      });
    cartSyncQueue.current = operation;
    operation.catch((error) => {
      console.error("Не удалось синхронизировать корзину с сервером:", error);
      setToast({ message: translate(currentLanguage.current, "Не удалось сохранить корзину на сервере. Проверьте подключение и повторите попытку."), type: "error" });
    });
    return operation;
  }, [clearCustomerSession]);

  const navigate = useCallback((path, replace = false) => {
    const target = path || "/";
    const destination = new URL(target, window.location.origin);
    const route = destination.pathname;
    if (`${window.location.pathname}${window.location.hash}` !== `${destination.pathname}${destination.hash}`) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", destination);
    }
    setRoutePath(route);
    setSection(route === "/admin" ? "admin" : "store");
    setActiveMobileTab(route === "/profile" ? "account" : "home");
    if (destination.hash) {
      window.setTimeout(() => document.getElementById(destination.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 0);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setRoutePath(path);
      setSection(path === "/admin" ? "admin" : "store");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!customerToken) return undefined;
    const controller = new AbortController();
    fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401 || response.status === 403) {
        window.localStorage.removeItem("electromart_user_token");
        window.localStorage.removeItem("electromart_user");
        setCustomerToken("");
        setCustomer(null);
        return;
      }
      if (!response.ok) throw new Error(`Customer profile request failed: ${response.status}`);
      const data = await response.json();
      setCustomer(data);
      window.localStorage.setItem("electromart_user", JSON.stringify(data));
    }).catch((error) => {
      if (error.name !== "AbortError") console.error("Не удалось проверить сеанс покупателя:", error);
    });
    return () => controller.abort();
  }, [customerToken]);

  useEffect(() => {
    try {
      window.localStorage.setItem("electromart_cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Не удалось сохранить корзину в локальном хранилище:", error);
    }
  }, [cart]);

  useEffect(() => {
    const token = customerToken;
    const generation = ++cartMergeGeneration.current;
    if (!token) {
      cartSyncReady.current = false;
      return undefined;
    }

    cartSyncReady.current = false;
    const controller = new AbortController();
    async function mergeSavedCart() {
      try {
        const response = await fetch(`${API_URL}/api/users/me/cart`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          clearCustomerSession();
          return;
        }
        if (!response.ok) throw new Error(`Could not load saved cart (${response.status}).`);
        const savedItems = await response.json();
        if (!Array.isArray(savedItems)) throw new Error("The server returned an invalid saved cart.");
        if (generation !== cartMergeGeneration.current || token !== currentCustomerToken.current) return;

        const ownerMatches = cartOwnerId.current === String(customer?.id || "");
        const includeLocalCart = !cartOwnerId.current || ownerMatches;
        const merged = includeLocalCart ? { ...cartRef.current } : {};
        for (const item of savedItems) {
          const productId = Number(item?.product_id);
          const savedQuantity = Math.floor(Number(item?.quantity));
          if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(savedQuantity) || savedQuantity < 1) continue;
          const localQuantity = includeLocalCart
            ? Math.max(0, Math.floor(Number(cartRef.current[productId]) || 0))
            : 0;
          const productStock = Number(item?.product?.stock_count);
          const combinedQuantity = ownerMatches
            ? Math.max(localQuantity, savedQuantity)
            : localQuantity + savedQuantity;
          merged[productId] = Number.isFinite(productStock) && productStock > 0
            ? Math.min(combinedQuantity, productStock)
            : combinedQuantity;
        }

        updateCart(merged);
        const mergedSnapshot = JSON.stringify(merged);
        cartSyncReady.current = true;
        await queueCartSync(token, merged, customer?.id);
        if (generation !== cartMergeGeneration.current || token !== currentCustomerToken.current) return;
        const latestCart = cartRef.current;
        if (JSON.stringify(latestCart) !== mergedSnapshot) {
          await queueCartSync(token, latestCart, customer?.id);
        }
      } catch (error) {
        if (error.name !== "AbortError" && generation === cartMergeGeneration.current) {
          console.error("Не удалось объединить корзину покупателя:", error);
          setToast({ message: translate(currentLanguage.current, "Не удалось загрузить сохранённую корзину. Локальная корзина сохранена."), type: "error" });
        }
      }
    }
    mergeSavedCart();
    return () => controller.abort();
  }, [customerToken, customer?.id, cartSyncRetry, clearCustomerSession, queueCartSync, updateCart]);

  useEffect(() => {
    if (!customerToken || cartSyncReady.current) return undefined;
    const retryMerge = () => setCartSyncRetry((attempt) => attempt + 1);
    window.addEventListener("online", retryMerge);
    window.addEventListener("focus", retryMerge);
    return () => {
      window.removeEventListener("online", retryMerge);
      window.removeEventListener("focus", retryMerge);
    };
  }, [customerToken, cartSyncRetry]);

  useEffect(() => {
    if (!customerToken || !cartSyncReady.current) return undefined;
    const token = customerToken;
    const snapshot = { ...cart };
    const timer = window.setTimeout(() => {
      queueCartSync(token, snapshot, currentCustomerId.current).catch(() => {});
    }, 180);
    return () => window.clearTimeout(timer);
  }, [cart, customerToken, queueCartSync]);

  useEffect(() => {
    const previousLanguage = filterCurrencyLanguage.current;
    if (previousLanguage !== language) {
      setMinPrice((value) => value === "" ? value : String(priceInCurrency(priceFromCurrency(value, previousLanguage), language)));
      setMaxPrice((value) => value === "" ? value : String(priceInCurrency(priceFromCurrency(value, previousLanguage), language)));
      filterCurrencyLanguage.current = language;
    }
  }, [language]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch (error) {
      console.error("Не удалось сохранить язык интерфейса:", error);
    }
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const defaultCountry = defaultPhoneCountry(language);
    setQuickPhoneCountry(defaultCountry);
    setCheckoutPhoneCountry(defaultCountry);
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`${API_URL}/api/products`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Сервер вернул данные каталога в неверном формате.");
        }
        setProducts(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setLoadError(
            "Не удалось загрузить каталог. Проверьте подключение к серверу ElectroMart Pro.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPromotions() {
      try {
        const response = await fetch(`${API_URL}/api/promotions`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Список акций получен в неверном формате.");
        setPromotions(data);
        setPromotionsError("");
      } catch (error) {
        if (error.name !== "AbortError") {
          setPromotionsError("Не удалось загрузить акции. Попробуйте обновить страницу.");
        }
      }
    }

    loadPromotions();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadNews() {
      try {
        const response = await fetch(`${API_URL}/api/news`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Список новостей получен в неверном формате.");
        setNews(data);
        setNewsError("");
      } catch (error) {
        if (error.name !== "AbortError") {
          setNewsError("Не удалось загрузить статьи. Попробуйте обновить страницу.");
        }
      }
    }

    loadNews();
    return () => controller.abort();
  }, []);

  const brands = useMemo(() => {
    const availableProducts =
      activeCategory === "Все"
        ? products
        : products.filter((product) => product.category === activeCategory);
    return [...new Set(availableProducts.map((product) => product.brand).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "ru"),
    );
  }, [activeCategory, products]);

  const localizedProducts = useMemo(
    () => products.map((product) => {
      const oldPrice = safeNumber(product.old_price) > safeNumber(product.price)
        ? safeNumber(product.old_price)
        : null;
      return {
        ...product,
        localizedName: localizeProductText(product.name, language),
        localizedCategory: translate(language, product.category),
        localizedSpecs: product.specs?.trim()
          ? localizeProductText(product.specs, language)
          : translate(language, "Характеристики уточняются"),
        formattedPrice: formatPrice(product.price, language),
        formattedOldPrice: oldPrice === null ? null : formatPrice(oldPrice, language),
        formattedInstallment: formatInstallment(product.price, language),
      };
    }),
    [language, products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    const minimum = minPrice === "" ? null : priceFromCurrency(minPrice, language);
    const maximum = maxPrice === "" ? null : priceFromCurrency(maxPrice, language);
    const filtered = localizedProducts.filter((product) => {
      const matchesCategory =
        activeCategory === "Все" || product.category === activeCategory;
      const searchableText = `${product.name} ${product.brand} ${product.sku} ${product.category}`
        .toLocaleLowerCase("ru");
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
      const matchesBrand = !brand || product.brand === brand;
      const matchesMin = minimum === null || product.price >= minimum;
      const matchesMax = maximum === null || product.price <= maximum;
      const matchesDiscount = !discountOnly || safeNumber(product.discount_percent) > 0;
      return (
        matchesCategory &&
        matchesSearch &&
        matchesBrand &&
        matchesMin &&
        matchesMax &&
        matchesDiscount
      );
    });

    if (sortBy === "price_asc") filtered.sort((a, b) => a.price - b.price);
    if (sortBy === "price_desc") filtered.sort((a, b) => b.price - a.price);
    if (sortBy === "discount") {
      filtered.sort(
        (a, b) => safeNumber(b.discount_percent) - safeNumber(a.discount_percent) || safeNumber(b.rating) - safeNumber(a.rating),
      );
    }
    if (sortBy === "popular") {
      filtered.sort((a, b) => b.rating - a.rating || b.stock_count - a.stock_count);
    }
    return filtered;
  }, [activeCategory, brand, discountOnly, language, localizedProducts, maxPrice, minPrice, search, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, brand, discountOnly, maxPrice, minPrice, search, sortBy]);

  useEffect(() => {
    if (brand && !brands.includes(brand)) setBrand("");
  }, [brand, brands]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const comparedProducts = comparedIds
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean);
  const cartItems = Object.entries(cart)
    .map(([id, quantity]) => ({
      product: products.find((product) => product.id === Number(id)),
      quantity,
    }))
    .filter((item) => item.product);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + safeNumber(item.product.price) * safeNumber(item.quantity),
    0,
  );
  const cartProductSavings = cartItems.reduce((sum, item) => {
    const price = safeNumber(item.product.price);
    const originalPrice = Math.max(safeNumber(item.product.old_price), price);
    return sum + (originalPrice - price) * safeNumber(item.quantity);
  }, 0);
  const promoDiscount = appliedPromo === "TECH10" ? Math.round(cartTotal * 0.1) : 0;
  const finalTotal = Math.max(0, cartTotal - promoDiscount);
  const featuredPromotion =
    promotions.find((promotion) =>
      `${promotion.title} ${promotion.subtitle}`.toLocaleLowerCase("ru").includes("распродаж"),
    ) || promotions[0];
  const secondaryPromotions = featuredPromotion
    ? promotions.filter((promotion) => promotion.id !== featuredPromotion.id).slice(0, 2)
    : [];

  const notify = (message, type = "success") => setToast({ message: translate(language, message), type });
  const hideToast = () => setToast(null);

  const handleAdminUnauthorized = useCallback(() => {
    try {
      window.localStorage.removeItem("admin_token");
      window.localStorage.removeItem("electromart-admin-token");
    } catch (error) {
      console.error("Не удалось удалить токен администратора:", error);
    }
    setAdminToken("");
    navigate("/admin");
    setAdminLoginError(translate(language, "Сеанс администратора завершён. Войдите снова."));
  }, [language, navigate]);

  async function submitAdminLogin(event) {
    event.preventDefault();
    setAdminLoginSubmitting(true);
    setAdminLoginError("");
    try {
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.token !== "string" || !result.token) {
        throw new Error(translate(language, result?.detail || "Не удалось выполнить вход."));
      }
      try {
        window.localStorage.setItem("admin_token", result.token);
        window.localStorage.setItem("electromart-admin-token", result.token);
      } catch (error) {
        throw new Error(translate(language, "Не удалось сохранить сеанс администратора в этом браузере."));
      }
      setAdminToken(result.token);
      setAdminPassword("");
      navigate("/admin");
    } catch (error) {
      setAdminLoginError(error.message || translate(language, "Не удалось подключиться к серверу."));
    } finally {
      setAdminLoginSubmitting(false);
    }
  }

  function logoutAdmin() {
    try {
      window.localStorage.removeItem("admin_token");
      window.localStorage.removeItem("electromart-admin-token");
    } catch (error) {
      console.error("Не удалось удалить токен администратора:", error);
    }
    setAdminToken("");
    navigate("/");
    setActiveMobileTab("home");
  }

  const updateCustomerProfile = useCallback((nextCustomer) => {
    setCustomer(nextCustomer);
    try {
      window.localStorage.setItem("electromart_user", JSON.stringify(nextCustomer));
    } catch (error) {
      console.error("Не удалось сохранить профиль покупателя:", error);
    }
  }, []);

  const logoutCustomer = useCallback(() => {
    try {
      window.localStorage.removeItem("electromart_user_token");
      window.localStorage.removeItem("electromart_user");
    } catch (error) {
      console.error("Не удалось завершить сеанс покупателя:", error);
    }
    setCustomerToken("");
    setCustomer(null);
    setCustomerLoginOpen(false);
    navigate("/");
  }, [navigate]);

  async function submitCustomerAuth(event) {
    event.preventDefault();
    setCustomerAuthSubmitting(true);
    setCustomerAuthError("");
    try {
      const phone = `+998${customerPhone.replace(/\D/g, "").slice(0, 9)}`;
      const registering = customerAuthMode === "register";
      const response = await fetch(`${API_URL}/api/auth/${registering ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          password: customerPassword,
          ...(registering ? { first_name: customerFirstName.trim() } : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.user_token || !result?.user) {
        throw new Error(result?.detail || translate(language, "Не удалось выполнить вход."));
      }
      window.localStorage.setItem("electromart_user_token", result.user_token);
      window.localStorage.setItem("electromart_user", JSON.stringify(result.user));
      setCustomerToken(result.user_token);
      setCustomer(result.user);
      setCustomerPassword("");
      setCustomerLoginOpen(false);
      setCheckoutName([result.user.first_name, result.user.last_name].filter(Boolean).join(" "));
      setCheckoutPhoneCountry("uz");
      setCheckoutPhone(result.user.phone.replace(/^\+998/, "").slice(0, 9));
      notify(registering ? "Регистрация прошла успешно." : "Вы вошли в аккаунт.");
      if (routePath === "/profile") navigate("/profile");
    } catch (error) {
      setCustomerAuthError(error.message || translate(language, "Не удалось подключиться к серверу."));
    } finally {
      setCustomerAuthSubmitting(false);
    }
  }

  useEffect(() => {
    if (!customer) return;
    setCheckoutName([customer.first_name, customer.last_name].filter(Boolean).join(" "));
    setQuickName([customer.first_name, customer.last_name].filter(Boolean).join(" "));
    if (customer.phone?.startsWith("+998")) {
      setCheckoutPhoneCountry("uz");
      setCheckoutPhone(customer.phone.slice(4, 13));
      setQuickPhoneCountry("uz");
      setQuickPhone(customer.phone.slice(4, 13));
    }
  }, [customer]);

  useEffect(() => {
    if (routePath === "/profile" && !customerToken) {
      setCustomerAuthMode("login");
      setCustomerLoginOpen(true);
    }
  }, [customerToken, routePath]);

  function openCart() {
    setCompareOpen(false);
    setMobileCatalogOpen(false);
    setQuickProduct(null);
    setSelectedArticle(null);
    setCheckoutConfirmation(null);
    setCartOpen(true);
  }

  function addToCart(product) {
    if (!product.in_stock || product.stock_count < 1) {
      notify("Этого товара сейчас нет в наличии.", "error");
      return;
    }
    updateCart((current) => ({
      ...current,
      [product.id]: Math.min((current[product.id] || 0) + 1, product.stock_count),
    }));
    notify("Товар добавлен в корзину");
  }

  function changeQuantity(product, change) {
    updateCart((current) => {
      const nextQuantity = (current[product.id] || 0) + change;
      if (nextQuantity <= 0) {
        const updated = { ...current };
        delete updated[product.id];
        return updated;
      }
      return { ...current, [product.id]: Math.min(nextQuantity, product.stock_count) };
    });
  }

  function toggleCompare(product) {
    setComparedIds((current) => {
      if (current.includes(product.id)) {
        return current.filter((id) => id !== product.id);
      }
      if (current.length >= 4) {
        notify("Для сравнения можно выбрать не более 4 товаров.", "error");
        return current;
      }
      return [...current, product.id];
    });
  }

  async function sendOrder({ name, phone, address, items, total, orderDetails }) {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(customerToken ? { Authorization: `Bearer ${customerToken}` } : {}),
        },
        body: JSON.stringify({
          customer_name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          items_json: JSON.stringify({
            items: items.map(({ product, quantity }) => ({
              product_id: product.id,
              sku: product.sku,
              name: product.name,
              quantity,
              price: safeNumber(product.price),
            })),
            ...orderDetails,
          }),
          total_price: total,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || "Не удалось оформить заказ. Попробуйте ещё раз.");
      }
      return await response.json();
    } catch (error) {
      notify(error.message || "Не удалось связаться с сервером.", "error");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function submitQuickOrder(event) {
    event.preventDefault();
    if (!quickProduct) return;
    const order = await sendOrder({
      name: quickName.trim() || "Покупатель",
      phone: phoneWithCountryCode(quickPhoneCountry, quickPhone),
      address: "Связаться с покупателем по телефону",
      items: [{ product: quickProduct, quantity: 1 }],
      total: safeNumber(quickProduct.price),
    });
    if (order) {
      setQuickProduct(null);
      setQuickPhone("");
      setQuickPhoneCountry(defaultPhoneCountry(language));
      setQuickName("");
      notify("Заявка принята! Мы скоро вам позвоним.");
    }
  }

  async function submitCartOrder(event) {
    event.preventDefault();
    if (cartItems.length === 0) return;
    const order = await sendOrder({
      name: checkoutName,
      phone: phoneWithCountryCode(checkoutPhoneCountry, checkoutPhone),
      address: checkoutAddress,
      items: cartItems,
      total: finalTotal,
      orderDetails: {
        payment_method: paymentMethod,
        promo_code: appliedPromo || null,
        discount: promoDiscount,
      },
    });
    if (order) {
      setCheckoutConfirmation({ orderId: order.id, total: finalTotal });
      updateCart({});
      setCheckoutName("");
      setCheckoutPhone("");
      setCheckoutPhoneCountry(defaultPhoneCountry(language));
      setCheckoutAddress("");
      setPromoInput("");
      setAppliedPromo("");
    }
  }

  function applyPromoCode() {
    const normalizedCode = promoInput.trim().toUpperCase();
    if (normalizedCode === "TECH10") {
      setAppliedPromo(normalizedCode);
      notify("Промокод TECH10 применён — дополнительная скидка 10%");
      return;
    }
    setAppliedPromo("");
    notify("Промокод не найден. Проверьте код и попробуйте ещё раз.", "error");
  }

  function showPromoProducts() {
    if (routePath !== "/") navigate("/");
    setSection("store");
    setSearch("");
    setActiveCategory("Все");
    setBrand("");
    setMinPrice("");
    setMaxPrice("");
    setDiscountOnly(true);
    setSortBy("discount");
    window.setTimeout(
      () => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }

  function resetFilters() {
    setSearch("");
    setActiveCategory("Все");
    setBrand("");
    setMinPrice("");
    setMaxPrice("");
    setDiscountOnly(false);
    setSortBy("popular");
  }

  function navigateHome() {
    navigate("/");
    resetFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateCatalog() {
    navigate("/");
    setMobileCatalogOpen(true);
  }

  function openCustomerAccount() {
    if (customer) {
      navigate("/profile");
      return;
    }
    setCustomerAuthMode("login");
    setCustomerAuthError("");
    setCustomerLoginOpen(true);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
    <Localized>
    <div className="app-shell">
      <style>{styles}</style>
      <header className="site-header">
        <div className="header-main page-width">
          <button
            className="brand-logo"
            aria-label="ElectroMart — на главную"
            onClick={() => {
              navigate("/");
              resetFilters();
            }}
          >
            <span className="logo-mark">
              <Zap size={23} fill="currentColor" />
            </span>
            <span className="logo-copy">
              <strong>Electro<span>Mart</span></strong>
              <small>ТЕХНИКА ДЛЯ ДОМА</small>
            </span>
          </button>

          <label className="search-box">
            <Search size={20} />
            <input
              type="search"
              placeholder="Найти холодильник, телевизор или бренд"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (routePath !== "/") navigate("/");
              }}
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="header-actions">
            <LanguageSelect language={language} onChange={setLanguage} />
            <PwaInstallButton />
            <button className="header-action compare-action" onClick={() => setCompareOpen(true)}>
              <span className="header-action-icon">
                <GitCompareArrows size={20} />
                {comparedIds.length > 0 && <span className="action-count">{comparedIds.length}</span>}
              </span>
              <span>Сравнение</span>
            </button>
            <button
              className="header-action cart-action"
              onClick={() => {
                openCart();
              }}
            >
              <span className="header-action-icon">
                <ShoppingCart size={21} />
                {cartCount > 0 && <span className="action-count">{cartCount}</span>}
              </span>
              <span className="cart-label">
                <strong>Корзина</strong>
                <small>{formatPrice(finalTotal, language)}</small>
              </span>
            </button>
            <button className="header-action customer-account-button" onClick={openCustomerAccount}>
              <span className="header-action-icon"><UserRound size={20} /></span>
              <span>{customer?.first_name || translate(language, "Войти")}</span>
            </button>
          </div>
        </div>
        <nav className="top-nav page-width" aria-label="Основная навигация">
          <button
            className={`nav-tab ${section === "store" ? "nav-tab-active" : ""}`}
            onClick={() => navigate("/")}
          >
            Витрина магазина
          </button>
          <span className="nav-note">
            <span className="status-dot" /> Работаем ежедневно, 09:00–21:00
          </span>
        </nav>
      </header>

      {routePath === "/profile" ? (
        customerToken && customer ? (
          <ProfilePage
            user={customer}
            token={customerToken}
            language={language}
            onUserUpdated={updateCustomerProfile}
            onLogout={logoutCustomer}
            onNavigate={navigate}
            onLanguageChange={setLanguage}
          />
        ) : (
          <main className="profile-auth-required page-width">
            <UserRound size={32} />
            <h1>{translate(language, "Войдите, чтобы открыть профиль")}</h1>
            <p>{translate(language, "Войдите или зарегистрируйтесь, чтобы видеть свои заказы и данные профиля.")}</p>
            <button className="primary-button" onClick={openCustomerAccount}>{translate(language, "Войти")}</button>
          </main>
        )
      ) : section === "store" ? (
        <main>
          <section className="promotions-section page-width" aria-label="Текущие акции">
            {featuredPromotion ? (
              <>
                <div className="promotion-banner">
                  <div className="promotion-decoration promotion-decoration-one" />
                  <div className="promotion-decoration promotion-decoration-two" />
                  <div className="promotion-copy">
                    <span className="promotion-kicker"><Zap size={14} fill="currentColor" /> ТОВАР ДНЯ / ГЛАВНАЯ РАСПРОДАЖА ТЕХНИКИ</span>
                    <h2>{featuredPromotion.title}</h2>
                    <p>{featuredPromotion.subtitle}</p>
                    <button className="promotion-button" onClick={showPromoProducts}>
                      Смотреть все товары по акции <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="promotion-offer">
                    <span className="promotion-discount">{featuredPromotion.discount_text}</span>
                    <span className="promotion-offer-caption">на технику для дома</span>
                    <span className="promotion-ends"><Clock3 size={13} /> До конца предложения</span>
                    <Countdown endDate={featuredPromotion.end_date} />
                    <span className="promotion-date"><CalendarDays size={12} /> до {formatArticleDate(featuredPromotion.end_date)}</span>
                  </div>
                  <div className="promotion-spark promotion-spark-one">✦</div>
                  <div className="promotion-spark promotion-spark-two">✧</div>
                </div>
                {secondaryPromotions.length > 0 && (
                  <div className="secondary-promotions">
                    {secondaryPromotions.map((promotion) => (
                      <article
                        className="secondary-promotion"
                        key={promotion.id}
                        style={{ "--promotion-color": promotion.banner_color || "#315fdd" }}
                      >
                        <div>
                          <span>{promotion.discount_text}</span>
                          <strong>{promotion.title}</strong>
                          <small>{promotion.subtitle}</small>
                        </div>
                        <button aria-label="Посмотреть товары со скидкой" onClick={showPromoProducts}>
                          <ArrowRight size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : promotionsError ? (
              <div className="promotions-error" role="status">{promotionsError}</div>
            ) : (
              <div className="promotions-loading"><span className="meta-live-dot" /> Загружаем актуальные предложения…</div>
            )}
          </section>

          <section className="hero page-width">
            <div className="hero-copy">
              <span className="hero-eyebrow"><Sparkles size={15} /> ВАШ ДОМ. ВАШИ ПРАВИЛА.</span>
              <h1>Техника, которая<br />делает <span>жизнь проще</span></h1>
              <p>
                Выбирайте лучшее для дома — с официальной гарантией, быстрой доставкой и
                честными ценами.
              </p>
              <div className="hero-actions">
                <button
                  className="primary-button hero-button"
                  onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Перейти в каталог <ArrowRight size={18} />
                </button>
                <span className="hero-promise"><ShieldCheck size={17} /> Только оригинальная техника</span>
              </div>
              <div className="hero-social-proof">
                <div className="avatar-stack" aria-hidden="true">
                  <span>М</span><span>А</span><span>Е</span><span>+</span>
                </div>
                <span><strong>4,9 из 5</strong><br />по отзывам покупателей</span>
                <span className="proof-divider" />
                <span><strong>{products.length || 120} товаров</strong><br />готовы к отправке</span>
              </div>
            </div>
            <div className="hero-art">
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="hero-product-card hero-fridge">
                <span className="hero-product-emoji">🧊</span>
                <span>Холодильники</span>
              </div>
              <div className="hero-product-card hero-tv">
                <span className="hero-product-emoji">📺</span>
                <span>Телевизоры</span>
              </div>
              <div className="hero-product-card hero-vacuum">
                <span className="hero-product-emoji">🧹</span>
                <span>Пылесосы</span>
              </div>
              <div className="hero-center">
                <div className="hero-center-glow" />
                <Zap size={90} strokeWidth={1.5} fill="currentColor" />
                <span>ElectroMart</span>
              </div>
              <div className="hero-discount">
                <strong>до −30%</strong>
                <span>на технику для дома</span>
              </div>
            </div>
            <div className="hero-pagination"><span /> <i /> <i /></div>
          </section>

          <section className="trust-bar page-width" aria-label="Преимущества магазина">
            <div className="trust-item">
              <span className="trust-icon blue"><ShieldCheck size={21} /></span>
              <span><strong>Официальная гарантия 2 года</strong><small>Сервисная поддержка по всей России</small></span>
            </div>
            <div className="trust-item">
              <span className="trust-icon green"><Truck size={21} /></span>
              <span><strong>Доставка в день заказа</strong><small>Бережно привезём и поднимем</small></span>
            </div>
            <div className="trust-item">
              <span className="trust-icon violet"><BadgeCheck size={21} /></span>
              <span><strong>Рассрочка 0-0-12 без переплат</strong><small>Удобные платежи на 12 месяцев</small></span>
            </div>
            <div className="trust-item">
              <span className="trust-icon orange"><ShoppingBag size={21} /></span>
              <span><strong>120+ товаров в наличии на складе</strong><small>Отправим без долгого ожидания</small></span>
            </div>
          </section>

          <section className="catalog-section page-width" id="catalog">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">ПОДБЕРИТЕ СВОЮ ТЕХНИКУ</span>
                <h2>Каталог <span>ElectroMart</span></h2>
                <p>Проверенные бренды, актуальные цены и всё для комфорта вашего дома.</p>
              </div>
              <div className="catalog-meta">
                <span className="meta-live-dot" />
                {loading ? "Обновляем каталог" : `${filteredProducts.length} товаров`}
                <span className="meta-separator">·</span>
                <span>в наличии</span>
              </div>
            </div>

            <div className="category-scroller" role="tablist" aria-label="Категории товаров">
              {CATEGORIES.map((category) => (
                <button
                  className={`category-pill ${activeCategory === category ? "category-pill-active" : ""}`}
                  key={category}
                  role="tab"
                  aria-selected={activeCategory === category}
                  onClick={() => {
                    setActiveCategory(category);
                    setBrand("");
                  }}
                >
                  {category === "Все" && <Sparkles size={15} />}
                  {category}
                  {category === "Все" && <span className="category-count">{products.length || 120}</span>}
                </button>
              ))}
            </div>

            <div className="catalog-layout">
              <aside className="filter-panel">
                <div className="filter-heading">
                  <span><SlidersHorizontal size={17} /> Фильтры</span>
                  <button onClick={resetFilters}>Сбросить</button>
                </div>
                <div className="filter-group">
                  <label className="filter-label" htmlFor="brand-filter">Бренд</label>
                  <div className="select-wrap">
                    <select id="brand-filter" value={brand} onChange={(event) => setBrand(event.target.value)}>
                      <option value="">Все бренды</option>
                      {brands.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
                <div className="filter-group">
                  <label className="filter-label">Цена, {currencyLabel(language)}</label>
                  <div className="price-inputs">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="От"
                      aria-label="Минимальная цена"
                      value={minPrice}
                      onChange={(event) => setMinPrice(event.target.value)}
                    />
                    <span>—</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="До"
                      aria-label="Максимальная цена"
                      value={maxPrice}
                      onChange={(event) => setMaxPrice(event.target.value)}
                    />
                  </div>
                  <div className="price-hints"><span>{formatPrice(10000, language)}</span><span>{formatPrice(150000, language)}</span></div>
                </div>
                <button
                  className={`discount-filter ${discountOnly ? "discount-filter-active" : ""}`}
                  onClick={() => setDiscountOnly((current) => !current)}
                  aria-pressed={discountOnly}
                >
                  <span className="discount-check">{discountOnly && <Check size={13} />}</span>
                  <span>Только со скидкой</span>
                  <span className="discount-spark">%</span>
                </button>
                <div className="sidebar-promo">
                  <span className="sidebar-promo-icon"><Headphones size={20} /></span>
                  <strong>Нужна помощь с выбором?</strong>
                  <p>Наши эксперты подскажут и помогут найти идеальную технику.</p>
                  <a href="tel:+78005553535">Позвонить нам <ArrowRight size={14} /></a>
                  <small>8 800 555-35-35 · бесплатно</small>
                </div>
                <div className="sidebar-guarantee"><ShieldCheck size={15} /> Покупайте уверенно — мы рядом</div>
              </aside>

              <div className="catalog-results">
                <div className="results-toolbar">
                  <div className="results-summary">
                    <strong>{loading ? "Загрузка…" : `${filteredProducts.length} товаров`}</strong>
                    {activeCategory !== "Все" && <span>в категории «{activeCategory}»</span>}
                  </div>
                  <label className="sort-control">
                    <ArrowDownWideNarrow size={16} />
                    <span>Сортировка:</span>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>

                {loadError && (
                  <div className="error-state">
                    <div className="error-icon"><Zap size={24} /></div>
                    <h3>Каталог временно недоступен</h3>
                    <p>{loadError}</p>
                    <button className="primary-button" onClick={() => window.location.reload()}>Попробовать снова</button>
                  </div>
                )}

                {loading && !loadError && (
                  <div className="product-grid">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div className="product-skeleton" key={index}>
                        <div className="skeleton-image" />
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                        <div className="skeleton-line price-skeleton" />
                      </div>
                    ))}
                  </div>
                )}

                {!loading && !loadError && filteredProducts.length > 0 && (
                  <>
                    <div className="product-grid">
                      {visibleProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          inCart={Boolean(cart[product.id])}
                          isCompared={comparedIds.includes(product.id)}
                          onAddToCart={addToCart}
                          onCompare={toggleCompare}
                          onQuickOrder={(selectedProduct) => setQuickProduct(selectedProduct)}
                        />
                      ))}
                    </div>
                    {visibleCount < filteredProducts.length && (
                      <div className="show-more-wrap">
                        <button className="show-more-button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                          Показать ещё товары
                          <span>{Math.min(PAGE_SIZE, filteredProducts.length - visibleCount)} из {filteredProducts.length - visibleCount}</span>
                          <ChevronDown size={17} />
                        </button>
                        <div className="results-progress">
                          <span style={{ width: `${(visibleProducts.length / filteredProducts.length) * 100}%` }} />
                        </div>
                        <small>Показано {visibleProducts.length} из {filteredProducts.length} товаров</small>
                      </div>
                    )}
                  </>
                )}

                {!loading && !loadError && filteredProducts.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon"><Search size={28} /></div>
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте изменить параметры фильтрации или поисковый запрос.</p>
                    <button className="secondary-button" onClick={resetFilters}>Сбросить фильтры</button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="news-section page-width" aria-labelledby="news-heading">
            <div className="section-heading news-heading">
              <div>
                <span className="section-eyebrow">ПОЛЕЗНОЕ ДЛЯ ВАШЕГО ДОМА</span>
                <h2 id="news-heading">Журнал <span>ElectroMart</span></h2>
                <p>Советы по выбору техники, уходу за ней и комфортной жизни дома.</p>
              </div>
              <div className="news-heading-note"><Sparkles size={16} /> Идеи и советы наших экспертов</div>
            </div>
            {newsError ? (
              <div className="news-error" role="status">{newsError}</div>
            ) : news.length > 0 ? (
              <div className="news-grid">
                {news.slice(0, 4).map((article) => (
                  <article className="news-card" key={article.id}>
                    <div className="news-card-image">
                      <NewsImage article={article} />
                      <span className="news-date"><CalendarDays size={12} /> {formatArticleDate(article.date)}</span>
                    </div>
                    <div className="news-card-body">
                      <span className="news-category">СОВЕТЫ И ОБЗОРЫ</span>
                      <h3>{article.title}</h3>
                      <p>{article.summary}</p>
                      <button onClick={() => setSelectedArticle(article)}>
                        Читать далее <ArrowRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="news-loading"><span className="meta-live-dot" /> Загружаем статьи и советы…</div>
            )}
          </section>

          <section className="bottom-promise page-width">
            <div className="promise-icon"><Heart size={20} /></div>
            <div><strong>Заботимся о каждом заказе</strong><span>Поможем выбрать, доставим и установим — чтобы вы наслаждались покупкой.</span></div>
            <span className="promise-rating"><Star size={16} fill="currentColor" /> 4,9 / 5 по отзывам клиентов</span>
          </section>
        </main>
      ) : adminToken ? (
        <AdminPanel
          initialProducts={products}
          onProductsChange={setProducts}
          onPromotionsChange={setPromotions}
          onNewsChange={setNews}
          notify={notify}
          language={language}
          adminToken={adminToken}
          onUnauthorized={handleAdminUnauthorized}
          onLogout={logoutAdmin}
        />
      ) : (
        <main className="admin-login-page page-width">
          <div className="admin-login-card">
            <span className="admin-login-icon"><KeyRound size={24} /></span>
            <span className="section-eyebrow">{translate(language, "ЗАЩИЩЁННЫЙ ДОСТУП")}</span>
            <h1>{translate(language, "Вход администратора")}</h1>
            <p>{translate(language, "Введите учётные данные владельца магазина для доступа к панели управления.")}</p>
            <form className="admin-login-form" onSubmit={submitAdminLogin}>
              <label>{translate(language, "Имя пользователя")}<input autoComplete="username" required maxLength={128} value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} /></label>
              <label>{translate(language, "Пароль")}<input type="password" autoComplete="current-password" required maxLength={256} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} /></label>
              {adminLoginError && <p className="admin-login-error" role="alert">{adminLoginError}</p>}
              <button className="primary-button checkout-button" type="submit" disabled={adminLoginSubmitting}>
                {adminLoginSubmitting ? translate(language, "Проверяем данные…") : <><KeyRound size={16} /> {translate(language, "Войти")}</>}
              </button>
            </form>
          </div>
        </main>
      )}

      <footer className="site-footer">
        <div className="page-width footer-inner">
          <span>© {new Date().getFullYear()} ElectroMart. Техника для дома с заботой.</span>
          <span><ShieldCheck size={15} /> Официальная гарантия на всю технику</span>
        </div>
      </footer>

      {routePath !== "/admin" && <nav className="mobile-bottom-nav" aria-label="Мобильная навигация">
        <button className={activeMobileTab === "home" ? "mobile-nav-active" : ""} onClick={() => { setActiveMobileTab("home"); navigateHome(); }}>
          <Home size={19} /><span>Главная</span>
        </button>
        <button className={activeMobileTab === "catalog" ? "mobile-nav-active" : ""} onClick={() => { setActiveMobileTab("catalog"); navigateCatalog(); }}>
          <LayoutGrid size={19} /><span>Каталог</span>
        </button>
        <button className={`mobile-nav-cart ${activeMobileTab === "cart" ? "mobile-nav-active" : ""}`} onClick={() => { setActiveMobileTab("cart"); openCart(); }}>
          <ShoppingCart size={19} />{cartCount > 0 && <b>{cartCount}</b>}<span>Корзина</span>
        </button>
        <button className={activeMobileTab === "account" ? "mobile-nav-active" : ""} onClick={openCustomerAccount}>
          <UserRound size={19} /><span>{customer?.first_name || "Профиль"}</span>
        </button>
      </nav>}

      {mobileCatalogOpen && (
        <div className="mobile-catalog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMobileCatalogOpen(false)}>
          <section className="mobile-catalog-sheet" role="dialog" aria-modal="true" aria-label="Каталог и фильтры">
            <div className="mobile-sheet-heading">
              <div><span className="section-eyebrow">ELECTROMART</span><h2>Каталог и фильтры</h2></div>
              <button className="icon-button" aria-label="Закрыть" onClick={() => setMobileCatalogOpen(false)}><X size={19} /></button>
            </div>
            <div className="mobile-sheet-content">
              <strong>Категории</strong>
              <div className="mobile-sheet-categories">
                {CATEGORIES.map((category) => (
                  <button key={category} className={activeCategory === category ? "mobile-sheet-category-active" : ""} onClick={() => { setActiveCategory(category); setBrand(""); }}>
                    {category}
                  </button>
                ))}
              </div>
              <label>Бренд
                <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                  <option value="">Все бренды</option>
                  {brands.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <div className="mobile-sheet-price">
                <label>Цена от<input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={formatPrice(10000, language)} /></label>
                <label>Цена до<input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={formatPrice(150000, language)} /></label>
              </div>
              <label className="mobile-sheet-discount"><input type="checkbox" checked={discountOnly} onChange={(event) => setDiscountOnly(event.target.checked)} /> Только со скидкой</label>
              <label>Сортировка
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mobile-sheet-actions">
              <button className="admin-secondary-button" onClick={resetFilters}>Сбросить</button>
              <button className="primary-button" onClick={() => { setMobileCatalogOpen(false); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); }}>Показать {filteredProducts.length} товаров</button>
            </div>
          </section>
        </div>
      )}

      {compareOpen && (
        <Modal title="Сравнение товаров" onClose={() => setCompareOpen(false)} wide>
          {comparedProducts.length === 0 ? (
            <div className="modal-empty">
              <div className="modal-empty-icon"><GitCompareArrows size={25} /></div>
              <strong>Добавьте товары для сравнения</strong>
              <p>Нажмите «Сравнить» на карточке товара — мы покажем характеристики рядом.</p>
              <button className="primary-button" onClick={() => setCompareOpen(false)}>Перейти к каталогу</button>
            </div>
          ) : (
            <div className="compare-content">
              <div className="compare-table">
                <div className="compare-row compare-header-row">
                  <div className="compare-label">Товар</div>
                  {comparedProducts.map((product) => (
                    <div className="compare-product-heading" key={product.id}>
                      <button className="remove-compare" aria-label="Убрать из сравнения" onClick={() => toggleCompare(product)}><X size={15} /></button>
                      <div className="compare-image"><ProductImage product={product} /></div>
                      <span className="compare-brand">{product.brand}</span>
                      <strong>{product.name}</strong>
                      <span className="compare-price">{formatPrice(product.price, language)}</span>
                    </div>
                  ))}
                </div>
                {[
                  ["Категория", (product) => product.category],
                  ["Бренд", (product) => product.brand],
                  ["Цена", (product) => formatPrice(product.price, language)],
                  ["Скидка", (product) => safeNumber(product.discount_percent) ? `−${safeNumber(product.discount_percent)}%` : "Без скидки"],
                  ["Рейтинг", (product) => `★ ${Number(product.rating || 0).toFixed(1)}`],
                  ["Наличие", (product) => product.in_stock ? `${product.stock_count} шт.` : "Нет в наличии"],
                  ["Характеристики", (product) => typeof product.specs === "string" && product.specs.trim() ? product.specs : "Не указаны"],
                ].map(([label, getter]) => (
                  <div className="compare-row" key={label}>
                    <div className="compare-label">{label}</div>
                    {comparedProducts.map((product) => <div className="compare-cell" key={product.id}>{getter(product)}</div>)}
                  </div>
                ))}
              </div>
              <div className="compare-actions">
                {comparedProducts.map((product) => (
                  <button className="primary-button" key={product.id} onClick={() => { addToCart(product); setCompareOpen(false); }}>
                    <ShoppingCart size={16} /> В корзину
                  </button>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {cartOpen && (
        <div className="drawer-backdrop fixed inset-0 z-[100]" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer overflow-y-auto max-h-screen" role="dialog" aria-modal="true" aria-label="Корзина">
            <div className="drawer-header">
              <div>
                <span className="section-eyebrow">{checkoutConfirmation ? "ЗАКАЗ ПРИНЯТ" : "ВАШ ВЫБОР"}</span>
                <h2>{checkoutConfirmation ? "Спасибо за покупку" : <>Корзина <span>({cartCount})</span></>}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Закрыть корзину"
                onClick={() => {
                  setCartOpen(false);
                  setCheckoutConfirmation(null);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {checkoutConfirmation ? (
              <div className="checkout-confirmation">
                <div className="confirmation-check"><Check size={31} /></div>
                <span className="section-eyebrow">ЗАКАЗ № {checkoutConfirmation.orderId}</span>
                <h3>Всё получилось!</h3>
                <p>Мы получили ваш заказ и скоро свяжемся с вами для подтверждения доставки.</p>
                <div className="confirmation-total">
                  <span>Итого к оплате</span>
                  <strong>{formatPrice(checkoutConfirmation.total, language)}</strong>
                </div>
                <div className="confirmation-payment"><BadgeCheck size={16} /> Способ оплаты: {paymentMethod}</div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setCheckoutConfirmation(null);
                    setCartOpen(false);
                  }}
                >
                  Продолжить покупки <ArrowRight size={16} />
                </button>
              </div>
            ) : cartItems.length === 0 ? (
              <div className="drawer-empty">
                <div className="drawer-empty-icon"><ShoppingCart size={30} /></div>
                <strong>Корзина пока пуста</strong>
                <p>Выберите технику, которая сделает ваш дом комфортнее.</p>
                <button className="primary-button" onClick={() => setCartOpen(false)}>Перейти в каталог</button>
              </div>
            ) : (
              <>
                <div className="cart-items-list">
                  {cartItems.map(({ product, quantity }) => (
                    <div className="cart-item" key={product.id}>
                      <div className="cart-item-image"><ProductImage product={product} /></div>
                      <div className="cart-item-info">
                        <span className="compare-brand">{product.brand}</span>
                        <strong>{product.name}</strong>
                        <span className="cart-item-price">
                          {formatPrice(safeNumber(product.price) * safeNumber(quantity), language)}
                          {safeNumber(product.old_price) > safeNumber(product.price) && (
                            <del>{formatPrice(safeNumber(product.old_price) * safeNumber(quantity), language)}</del>
                          )}
                        </span>
                        <div className="quantity-control">
                          <button aria-label="Уменьшить количество" onClick={() => changeQuantity(product, -1)}><Minus size={14} /></button>
                          <span>{quantity}</span>
                          <button aria-label="Увеличить количество" disabled={quantity >= product.stock_count} onClick={() => changeQuantity(product, 1)}><Plus size={14} /></button>
                        </div>
                      </div>
                      <button className="remove-cart-item" aria-label="Удалить из корзины" onClick={() => updateCart((current) => { const updated = { ...current }; delete updated[product.id]; return updated; })}><X size={16} /></button>
                    </div>
                  ))}
                </div>
                <form className="checkout-form" onSubmit={submitCartOrder}>
                  <div className="promo-code-form">
                    <label htmlFor="promo-code-input"><Tag size={14} /> Промокод</label>
                    <div className="promo-code-controls">
                      <input
                        id="promo-code-input"
                        value={promoInput}
                        onChange={(event) => setPromoInput(event.target.value)}
                        placeholder="Введите код, например TECH10"
                        disabled={appliedPromo === "TECH10"}
                      />
                      {appliedPromo === "TECH10" ? (
                        <button type="button" className="promo-applied-button" onClick={() => setAppliedPromo("")}>
                          <Check size={14} /> Применён
                        </button>
                      ) : (
                        <button type="button" className="apply-promo-button" onClick={applyPromoCode}>Применить</button>
                      )}
                    </div>
                  </div>
                  <div className="cart-price-breakdown">
                    <div><span>Стоимость товаров</span><span>{formatPrice(cartTotal, language)}</span></div>
                    {cartProductSavings > 0 && (
                      <div className="saving-row"><span>Скидки на товары</span><span>−{formatPrice(cartProductSavings, language)}</span></div>
                    )}
                    {promoDiscount > 0 && (
                      <div className="saving-row"><span>Промокод TECH10 (10%)</span><span>−{formatPrice(promoDiscount, language)}</span></div>
                    )}
                  </div>
                  <div className="cart-total-row"><span>Итого к оплате</span><strong>{formatPrice(finalTotal, language)}</strong></div>
                  {promoDiscount > 0 && (
                    <div className="checkout-savings">Ваша общая экономия: {formatPrice(cartProductSavings + promoDiscount, language)}</div>
                  )}
                  <div className="installment-line"><BadgeCheck size={15} /> {formatInstallment(finalTotal, language)}</div>
                  <label>Ваше имя<input required value={checkoutName} onChange={(event) => setCheckoutName(event.target.value)} placeholder="Как к вам обращаться" /></label>
                  <PhoneField
                    id="checkout-phone"
                    label="Телефон"
                    value={checkoutPhone}
                    onChange={setCheckoutPhone}
                    countryId={checkoutPhoneCountry}
                    onCountryChange={setCheckoutPhoneCountry}
                  />
                  <label>Адрес доставки<input required value={checkoutAddress} onChange={(event) => setCheckoutAddress(event.target.value)} placeholder="Город, улица, дом" /></label>
                  <label>
                    Способ оплаты
                    <select className="payment-select" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                      <option value="Картой онлайн">Картой онлайн</option>
                      <option value="При получении">При получении</option>
                      <option value="В рассрочку 0-0-12">В рассрочку 0-0-12</option>
                    </select>
                  </label>
                  <button className="primary-button checkout-button" type="submit" disabled={submitting}>
                    {submitting ? "Оформляем заказ…" : "Оформить заказ"} <ArrowRight size={17} />
                  </button>
                  <small className="checkout-note"><ShieldCheck size={13} /> Данные заказа и способ оплаты будут сохранены</small>
                </form>
              </>
            )}
          </aside>
        </div>
      )}

      {quickProduct && (
        <Modal title="Покупка в один клик" onClose={() => setQuickProduct(null)}>
          <div className="quick-product">
            <div className="quick-image"><ProductImage product={quickProduct} /></div>
            <div>
              <span className="compare-brand">{quickProduct.brand}</span>
              <strong>{quickProduct.name}</strong>
              <span className="quick-price">{formatPrice(quickProduct.price, language)}</span>
            </div>
          </div>
          <form className="quick-form" onSubmit={submitQuickOrder}>
            <p>Оставьте номер — менеджер перезвонит и поможет оформить заказ.</p>
            <label>Ваше имя <span>необязательно</span><input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder="Как к вам обращаться" /></label>
            <PhoneField
              id="quick-order-phone"
              label="Номер телефона"
              value={quickPhone}
              onChange={setQuickPhone}
              countryId={quickPhoneCountry}
              onCountryChange={setQuickPhoneCountry}
            />
            <button className="primary-button checkout-button" type="submit" disabled={submitting}>
              {submitting ? "Отправляем заявку…" : "Жду звонка"} <ArrowRight size={17} />
            </button>
            <small className="checkout-note"><ShieldCheck size={13} /> Без предоплаты. Ваши данные в безопасности.</small>
          </form>
        </Modal>
      )}

      {section === "store" && routePath !== "/profile" && <CustomerSupportChat />}

      {selectedArticle && (
        <Modal title="Журнал ElectroMart" onClose={() => setSelectedArticle(null)} wide>
          <article className="article-modal">
            <div className="article-modal-image"><NewsImage article={selectedArticle} /></div>
            <div className="article-modal-copy">
              <span className="news-date article-date"><CalendarDays size={13} /> {formatArticleDate(selectedArticle.date)}</span>
              <h2>{selectedArticle.title}</h2>
              <p className="article-summary">{selectedArticle.summary}</p>
              <div className="article-content">{selectedArticle.content}</div>
              <div className="article-signature"><Zap size={15} fill="currentColor" /> Команда ElectroMart — техника для дома с заботой</div>
            </div>
          </article>
        </Modal>
      )}

      {customerLoginOpen && (
        <Modal title={customerAuthMode === "register" ? "Создать аккаунт" : "Войти"} onClose={() => setCustomerLoginOpen(false)}>
          <form className="customer-auth-form" onSubmit={submitCustomerAuth}>
            <div className="customer-auth-switch">
              <button type="button" className={customerAuthMode === "login" ? "active" : ""} onClick={() => { setCustomerAuthMode("login"); setCustomerAuthError(""); }}>Войти</button>
              <button type="button" className={customerAuthMode === "register" ? "active" : ""} onClick={() => { setCustomerAuthMode("register"); setCustomerAuthError(""); }}>Зарегистрироваться</button>
            </div>
            {customerAuthMode === "register" && (
              <label>Имя<input value={customerFirstName} onChange={(event) => setCustomerFirstName(event.target.value)} required maxLength={100} autoComplete="given-name" /></label>
            )}
            <label>Номер телефона
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={`+998 ${formatPhoneDigits(customerPhone, PHONE_COUNTRIES[0])}`}
                onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, "").replace(/^998/, "").slice(0, 9))}
                placeholder="+998 00 000-00-00"
                required
              />
            </label>
            <label>Пароль<input type="password" value={customerPassword} onChange={(event) => setCustomerPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete={customerAuthMode === "register" ? "new-password" : "current-password"} /></label>
            {customerAuthError && <p className="admin-login-error" role="alert">{customerAuthError}</p>}
            <button className="primary-button checkout-button" type="submit" disabled={customerAuthSubmitting}>
              {customerAuthSubmitting ? "Подождите…" : customerAuthMode === "register" ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
        </Modal>
      )}

      <Toast toast={toast} onClose={hideToast} />
    </div>
    </Localized>
    </LanguageContext.Provider>
  );
}

function ProductCard({ product, inCart, isCompared, onAddToCart, onCompare, onQuickOrder }) {
  const { language } = useContext(LanguageContext);
  const oldPrice = safeNumber(product.old_price) > safeNumber(product.price) ? safeNumber(product.old_price) : null;
  const stockCount = Number(product.stock_count || 0);
  const rating = Number(product.rating || 0);
  const badgeLabel = product.is_promo ? "АКЦИЯ" : product.rating >= 4.8 ? "ХИТ" : null;

  return (
    <Localized>
    <article className="product-card">
      <div className="product-visual">
        <ProductImage product={product} className="product-photo" />
        <div className="product-badges">
          {safeNumber(product.discount_percent) > 0 && <span className="discount-badge">−{safeNumber(product.discount_percent)}%</span>}
          {badgeLabel && <span className={`status-badge ${badgeLabel === "ХИТ" ? "hit-badge" : ""}`}>{badgeLabel}</span>}
        </div>
        <button
          className={`favorite-button ${isCompared ? "favorite-selected" : ""}`}
          aria-label={isCompared ? "Убрать из сравнения" : "Добавить товар в сравнение"}
          title={isCompared ? "Убрать из сравнения" : "Добавить в сравнение"}
          onClick={() => onCompare(product)}
        >
          <GitCompareArrows size={17} />
        </button>
        <div className={`stock-label ${stockCount > 0 ? "" : "stock-out"}`}>
          <span />{stockCount > 0 ? `В наличии: ${stockCount} шт.` : "Нет в наличии"}
        </div>
      </div>
      <div className="product-body">
        <div className="product-meta-row">
          <span className="product-brand">{product.brand}</span>
          <span className="product-rating"><Star size={13} fill="currentColor" /> {rating.toFixed(1)}</span>
        </div>
        <h3 title={product.localizedName || product.name}>{product.localizedName || product.name}</h3>
        <p className="product-specs">{product.localizedSpecs || (typeof product.specs === "string" && product.specs.trim() ? product.specs : "Характеристики уточняются")}</p>
        <div className="product-price-block">
          <div className="price-line">
            <strong>{product.formattedPrice || formatPrice(product.price, language)}</strong>
            {oldPrice && <del>{product.formattedOldPrice || formatPrice(oldPrice, language)}</del>}
          </div>
          <div className="installment"><BadgeCheck size={14} /> {product.formattedInstallment || formatInstallment(product.price, language)}</div>
        </div>
        <div className="product-actions">
          <button className={`add-cart-button ${inCart ? "added-cart-button" : ""}`} onClick={() => onAddToCart(product)} disabled={stockCount < 1}>
            {inCart ? <><Check size={16} /> Добавить ещё</> : <><ShoppingCart size={16} /> В корзину</>}
          </button>
          <button className="quick-buy-button" onClick={() => onQuickOrder(product)} disabled={stockCount < 1}>
            Купить в 1 клик
          </button>
        </div>
        <button className={`compare-link ${isCompared ? "compare-link-selected" : ""}`} onClick={() => onCompare(product)}>
          {isCompared ? <><Check size={14} /> Добавлен к сравнению</> : <><GitCompareArrows size={14} /> Сравнить характеристики</>}
        </button>
      </div>
    </article>
    </Localized>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Localized>
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-dialog ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть окно" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
    </Localized>
  );
}

const styles = `
  :root{font-family:Inter,Arial,sans-serif;color:#172033;background:#f5f7fb;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto;font-weight:400;--blue:#245be7;--blue-dark:#1846c7;--ink:#172033;--muted:#758198;--line:#e7ebf2;--green:#12a873}
  *{box-sizing:border-box}
  body{margin:0;min-width:360px;background:#f5f7fb}
  button,input,select{font:inherit}
  button{cursor:pointer}
  button:disabled{cursor:not-allowed;opacity:.55}
  a{color:inherit;text-decoration:none}
  .app-shell{min-height:100vh}
  .page-width{width:min(1360px,calc(100% - 64px));margin:0 auto}
  .site-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.97);backdrop-filter:blur(16px);border-bottom:1px solid #e8ebf1}
  .header-main{height:82px;display:flex;align-items:center;gap:34px}
  .brand-logo{border:0;background:transparent;display:flex;align-items:center;gap:11px;padding:0;flex-shrink:0;text-align:left;color:var(--ink)}
  .logo-mark{width:43px;height:43px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#2c70ff,#174bd5);color:white;box-shadow:0 7px 17px #245be733}
  .logo-copy{display:grid;gap:2px}.logo-copy strong{font-size:21px;letter-spacing:-1.1px;font-weight:800}.logo-copy strong span{color:var(--blue)}.logo-copy small{font-size:8px;letter-spacing:1.55px;color:#8893a7;font-weight:700}
  .search-box{height:46px;max-width:530px;flex:1;display:flex;align-items:center;gap:11px;background:#f5f7fb;border:1px solid #edf0f5;border-radius:12px;padding:0 14px;color:#8792a6;transition:.2s}
  .search-box:focus-within{background:white;border-color:#9bb8ff;box-shadow:0 0 0 3px #245be711}
  .search-box input{width:100%;border:0;outline:0;background:transparent;color:var(--ink);font-size:12px}
  .search-box input::placeholder{color:#939db0}
  .search-box kbd{font-size:10px;color:#a0a9ba;background:white;padding:4px 6px;border:1px solid #e8ebf0;border-radius:5px;white-space:nowrap}
  .header-actions{display:flex;align-items:center;gap:23px;margin-left:auto}
  .header-action{position:relative;display:flex;align-items:center;gap:9px;border:0;background:transparent;color:#4f5c73;font-size:11px;font-weight:600;padding:7px 0}
  .header-action-icon{position:relative;display:grid;place-items:center;color:#26344c}
  .action-count{position:absolute;top:-8px;right:-9px;min-width:17px;height:17px;padding:0 4px;display:grid;place-items:center;border-radius:99px;background:#ef4e61;color:white;font-size:9px;font-weight:700;border:2px solid white}
  .cart-label{display:grid;gap:2px;text-align:left}.cart-label strong{font-size:11px;color:#26344c}.cart-label small{font-size:10px;color:#748097}
  .admin-toggle{height:40px;padding:0 14px;display:flex;align-items:center;gap:8px;color:white;font-size:11px;font-weight:700;background:#172b58;border:0;border-radius:10px;transition:.2s;white-space:nowrap}
  .admin-toggle:hover{background:#203d7b;transform:translateY(-1px)}
  .top-nav{height:47px;display:flex;align-items:stretch;gap:30px}
  .nav-tab{position:relative;border:0;background:transparent;padding:0;color:#778298;font-size:11px;font-weight:600}
  .nav-tab-active{color:#2155db}.nav-tab-active:after{content:"";position:absolute;bottom:-1px;left:0;right:0;height:2px;background:#2861eb;border-radius:2px}
  .nav-note{margin-left:auto;display:flex;align-items:center;gap:7px;color:#8792a6;font-size:10px}
  .status-dot,.meta-live-dot{width:7px;height:7px;border-radius:50%;background:#20bd83;box-shadow:0 0 0 3px #20bd831a}
  .hero{position:relative;min-height:390px;margin-top:27px;border-radius:22px;overflow:hidden;background:linear-gradient(112deg,#eef4ff 0%,#f1f5ff 50%,#e6edff 100%);display:flex}
  .hero:before{content:"";position:absolute;width:480px;height:480px;border:1px solid #cdd9f6;border-radius:50%;right:5%;top:-290px}
  .hero-copy{z-index:1;width:54%;padding:48px 0 31px 59px}
  .hero-eyebrow,.section-eyebrow{display:flex;align-items:center;gap:7px;color:#3263d6;font-weight:800;font-size:9px;letter-spacing:1.6px}
  .hero-eyebrow{padding:8px 11px;background:#fff;border:1px solid #e1e9fc;border-radius:99px;width:max-content;box-shadow:0 4px 12px #294f9b0a}
  .hero h1{font-size:40px;line-height:1.12;letter-spacing:-1.9px;margin:17px 0 13px;font-weight:800;color:#14264e}
  .hero h1 span{color:#2c61dc}
  .hero-copy>p{max-width:480px;color:#697896;font-size:12px;line-height:1.85;margin:0}
  .hero-actions{display:flex;align-items:center;gap:18px;margin-top:22px}
  .primary-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:10px;background:linear-gradient(135deg,#2d6af2,#2052d8);color:white;font-size:11px;font-weight:700;padding:12px 16px;box-shadow:0 7px 16px #245be72a;transition:.2s}
  .primary-button:hover:not(:disabled){background:linear-gradient(135deg,#205de9,#1746c9);box-shadow:0 9px 20px #245be740;transform:translateY(-1px)}
  .hero-button{height:43px;padding:0 17px}
  .hero-promise{display:flex;align-items:center;gap:6px;color:#657594;font-size:10px;font-weight:600}
  .hero-promise svg{color:#18a878}
  .hero-social-proof{display:flex;align-items:center;gap:10px;margin-top:27px;font-size:9px;line-height:1.5;color:#8090a9}
  .hero-social-proof strong{color:#283b61;font-size:10px}
  .avatar-stack{display:flex;padding-left:3px}
  .avatar-stack span{width:25px;height:25px;margin-left:-4px;display:grid;place-items:center;border:2px solid #f1f5ff;border-radius:50%;background:#f8bfaa;color:#815848;font-size:8px;font-weight:700}
  .avatar-stack span:nth-child(2){background:#b3d4c3;color:#4c715f}.avatar-stack span:nth-child(3){background:#d7c8f2;color:#655487}.avatar-stack span:nth-child(4){background:#2f61d8;color:white}
  .proof-divider{height:24px;width:1px;background:#d3dcef;margin:0 3px}
  .hero-art{position:absolute;right:0;top:0;width:51%;height:100%;overflow:hidden}
  .hero-orbit{position:absolute;border:1px solid #d5def4;border-radius:50%;left:18%;top:7%;width:380px;height:380px}
  .orbit-two{left:10%;top:15%;width:310px;height:310px;border-style:dashed;opacity:.75}
  .hero-center{position:absolute;top:88px;left:34%;width:190px;height:190px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#fff,#e5edff);color:#2b66e9;box-shadow:0 28px 55px #3154a526,inset 0 0 0 1px #fff}
  .hero-center svg{filter:drop-shadow(0 9px 12px #245be744);z-index:1}
  .hero-center span{position:absolute;bottom:40px;color:#1c3263;font-weight:800;font-size:12px}
  .hero-center-glow{position:absolute;inset:23px;border:1px solid #cbd9fb;border-radius:50%}
  .hero-product-card{position:absolute;z-index:2;display:flex;align-items:center;gap:8px;padding:9px 12px;background:#ffffffed;border:1px solid #e8edfa;border-radius:12px;box-shadow:0 9px 22px #31497717;color:#4d5e7d;font-size:9px;font-weight:700}
  .hero-product-emoji{font-size:19px}
  .hero-fridge{top:64px;left:6%}.hero-tv{right:7%;top:125px}.hero-vacuum{bottom:59px;left:19%}
  .hero-discount{position:absolute;right:8%;bottom:47px;display:grid;gap:3px;padding:11px 15px;border-radius:13px;background:#fff;box-shadow:0 10px 24px #263e731c;transform:rotate(-4deg)}
  .hero-discount strong{font-size:17px;color:#f14c69}.hero-discount span{font-size:8px;color:#8290a7}
  .hero-pagination{position:absolute;bottom:17px;left:59px;display:flex;gap:5px}
  .hero-pagination span,.hero-pagination i{width:16px;height:4px;border-radius:4px;background:#2c61db}.hero-pagination i{width:5px;background:#c7d4ee}
  .trust-bar{display:grid;grid-template-columns:repeat(4,1fr);margin-top:16px;padding:17px 18px;background:white;border:1px solid #e9edf4;border-radius:15px;box-shadow:0 5px 16px #1c31520a}
  .trust-item{display:flex;align-items:center;gap:10px;padding:0 13px;border-right:1px solid #edf0f5}
  .trust-item:last-child{border-right:0}
  .trust-icon{width:37px;height:37px;flex:0 0 37px;border-radius:11px;display:grid;place-items:center}
  .trust-icon.blue{color:#3269e8;background:#edf3ff}.trust-icon.green{color:#13a779;background:#e9f8f2}.trust-icon.violet{color:#8461df;background:#f3efff}.trust-icon.orange{color:#e79b38;background:#fff5e8}
  .trust-item>span:last-child{display:grid;gap:4px}
  .trust-item strong{font-size:9px;color:#34425b;line-height:1.4}
  .trust-item small{font-size:8px;color:#8b96a9;line-height:1.3}
  .catalog-section{padding:55px 0 50px}
  .section-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:23px}
  .section-heading h2{margin:8px 0 5px;color:#17233d;font-size:27px;line-height:1.2;letter-spacing:-1px;font-weight:800}
  .section-heading h2 span{color:#2b60df}
  .section-heading p{margin:0;color:#818ca0;font-size:10px}
  .catalog-meta{display:flex;align-items:center;gap:8px;padding-bottom:5px;color:#7a879b;font-size:10px}
  .meta-separator{color:#c3cad6}
  .category-scroller{display:flex;gap:8px;overflow-x:auto;padding:2px 1px 14px;scrollbar-width:none}
  .category-scroller::-webkit-scrollbar{display:none}
  .category-pill{height:37px;display:flex;align-items:center;gap:7px;flex-shrink:0;padding:0 13px;border:1px solid #e5e9f0;border-radius:9px;background:white;color:#657189;font-size:9px;font-weight:600;transition:.2s}
  .category-pill:hover{border-color:#b4c7f5;color:#2d5fd9}
  .category-pill-active{border-color:#2862e7;background:#2862e7;color:white;box-shadow:0 5px 12px #2862e72c}
  .category-pill-active:hover{color:white;background:#2256d5}
  .category-count{font-size:8px;opacity:.7}
  .catalog-layout{display:grid;grid-template-columns:210px minmax(0,1fr);align-items:start;gap:19px}
  .filter-panel{position:sticky;top:146px;padding:16px;background:#fff;border:1px solid #e8ebf1;border-radius:13px}
  .filter-heading{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid #eef0f4}
  .filter-heading>span{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#273650}
  .filter-heading>span svg{color:#3969df}
  .filter-heading button{border:0;background:none;color:#3564d9;font-size:9px;padding:3px}
  .filter-group{padding:15px 0 13px;border-bottom:1px solid #eef0f4}
  .filter-label{display:block;color:#4d5b73;font-size:9px;font-weight:700;margin-bottom:9px}
  .select-wrap,.sort-control{position:relative;display:flex;align-items:center}
  .select-wrap select{width:100%;appearance:none;padding:10px 30px 10px 10px;border:1px solid #e5e9f0;border-radius:8px;background:#fafbfc;color:#526078;font-size:9px;outline:none}
  .select-wrap>svg{position:absolute;right:10px;pointer-events:none;color:#8a95a8}
  .price-inputs{display:flex;align-items:center;gap:6px}
  .price-inputs input{width:calc(50% - 8px);min-width:0;height:34px;padding:0 8px;border:1px solid #e5e9f0;border-radius:7px;background:#fafbfc;font-size:9px;color:#33415a;outline:none}
  .price-inputs input:focus,.select-wrap select:focus{border-color:#92adf2}
  .price-inputs span{color:#aab2c0;font-size:10px}
  .price-inputs input::-webkit-inner-spin-button,.price-inputs input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
  .price-hints{display:flex;justify-content:space-between;margin-top:6px;color:#a0a9b8;font-size:8px}
  .discount-filter{width:100%;display:flex;align-items:center;gap:9px;padding:14px 0;border:0;border-bottom:1px solid #eef0f4;background:transparent;text-align:left;color:#53617a;font-size:9px;font-weight:600}
  .discount-check{width:15px;height:15px;display:grid;place-items:center;border:1px solid #d6dce6;border-radius:4px;color:white}
  .discount-filter-active .discount-check{background:#2c62e3;border-color:#2c62e3}
  .discount-filter-active{color:#275bd6}
  .discount-spark{margin-left:auto;display:grid;place-items:center;width:22px;height:22px;border-radius:6px;color:#ec5470;background:#fff0f2;font-weight:800;font-size:10px}
  .sidebar-promo{margin-top:14px;padding:13px 11px;border-radius:10px;background:linear-gradient(145deg,#f1f5ff,#f7f8ff);border:1px solid #e9efff}
  .sidebar-promo-icon{width:28px;height:28px;display:grid;place-items:center;margin-bottom:9px;border-radius:8px;color:#3264df;background:#e1eaff}
  .sidebar-promo strong{display:block;font-size:9px;color:#334565}
  .sidebar-promo p{font-size:8px;line-height:1.7;color:#7888a5;margin:6px 0 9px}
  .sidebar-promo a{display:flex;align-items:center;gap:4px;color:#2d60db;font-size:8px;font-weight:700}
  .sidebar-promo small{display:block;margin-top:6px;color:#919cb0;font-size:7px}
  .sidebar-guarantee{display:flex;align-items:center;gap:6px;margin-top:12px;color:#8190a7;font-size:8px}
  .sidebar-guarantee svg{color:#19a979}
  .catalog-results{min-width:0}
  .results-toolbar{height:45px;display:flex;justify-content:space-between;align-items:flex-start}
  .results-summary{display:flex;align-items:center;gap:8px;color:#8a95a8;font-size:9px}
  .results-summary strong{font-size:11px;color:#273650}
  .sort-control{gap:7px;color:#8a95a8;font-size:9px}
  .sort-control>svg:first-child{color:#66758f}
  .sort-control select{appearance:none;max-width:142px;border:0;outline:0;background:transparent;padding:3px 16px 3px 0;color:#394761;font-size:9px;font-weight:600;cursor:pointer}
  .sort-control>svg:last-child{position:absolute;right:0;pointer-events:none}
  .product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
  .product-card{min-width:0;background:white;border:1px solid #e8ebf1;border-radius:12px;overflow:hidden;transition:box-shadow .2s,transform .2s,border-color .2s}
  .product-card:hover{transform:translateY(-3px);border-color:#d6e0f7;box-shadow:0 12px 26px #1b2c4a12}
  .product-visual{position:relative;height:155px;overflow:hidden;background:linear-gradient(135deg,#f1f4f9,#e9edf5)}
  .product-photo{width:100%;height:100%;display:block;object-fit:cover;transition:transform .35s}
  .product-card:hover .product-photo{transform:scale(1.035)}
  .product-image-fallback{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:radial-gradient(circle at 50% 40%,#fff 0%,#eff3fa 72%);color:#a3b2cc}
  .product-image-fallback span{font-size:8px;color:#8796b0;font-weight:600}
  .product-badges{position:absolute;z-index:1;top:9px;left:9px;display:flex;gap:5px}
  .discount-badge,.status-badge{padding:5px 7px;border-radius:5px;background:#f04d68;color:white;font-size:8px;font-weight:800;letter-spacing:.2px}
  .status-badge{background:#ff9e38}.hit-badge{background:#3267e8}
  .favorite-button{position:absolute;right:9px;top:9px;width:29px;height:29px;display:grid;place-items:center;border:0;border-radius:50%;background:#ffffffed;color:#6e7c92;box-shadow:0 2px 8px #18305213;transition:.2s}
  .favorite-button:hover,.favorite-selected{color:#2e60db;background:#fff}
  .stock-label{position:absolute;bottom:9px;left:9px;display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:5px;background:#fffffff0;color:#2f7c5c;font-size:8px;font-weight:600}
  .stock-label>span{width:5px;height:5px;border-radius:50%;background:#18ac78}
  .stock-out{color:#d84f61}.stock-out>span{background:#e45265}
  .product-body{padding:11px 12px 10px}
  .product-meta-row{display:flex;align-items:center;justify-content:space-between}
  .product-brand{color:#2f61d6;font-size:8px;letter-spacing:.5px;text-transform:uppercase;font-weight:800}
  .product-rating{display:flex;align-items:center;gap:3px;color:#e3a32f;font-size:8px;font-weight:700}
  .product-card h3{height:32px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:6px 0 5px;color:#26344d;font-size:10px;line-height:1.55;font-weight:700}
  .product-specs{height:28px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:0;color:#8b96a8;font-size:8px;line-height:1.6}
  .product-price-block{margin-top:9px;padding-top:9px;border-top:1px solid #f0f2f6}
  .price-line{min-height:23px;display:flex;align-items:baseline;gap:7px}
  .price-line strong{color:#172541;font-size:17px;letter-spacing:-.6px}
  .price-line strong small{font-size:11px}
  .price-line del{color:#a4adbb;font-size:8px}
  .installment{display:flex;align-items:center;gap:4px;margin-top:4px;color:#779176;font-size:7px}
  .installment svg{color:#14a773;flex-shrink:0}
  .product-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
  .add-cart-button,.quick-buy-button{height:33px;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:7px;font-size:8px;font-weight:700;transition:.2s}
  .add-cart-button{border:1px solid #245be7;background:#275fe7;color:white}
  .add-cart-button:hover:not(:disabled){background:#174dce}
  .added-cart-button{border-color:#18a978;background:#eaf8f2;color:#16865f}
  .quick-buy-button{border:1px solid #dfe5ef;background:white;color:#4e5e78}
  .quick-buy-button:hover:not(:disabled){border-color:#a9bdf1;color:#2658d5;background:#f7f9ff}
  .compare-link{width:100%;height:27px;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:5px;border:0;background:transparent;color:#8994a7;font-size:8px}
  .compare-link:hover,.compare-link-selected{color:#2e60da}
  .show-more-wrap{display:flex;flex-direction:column;align-items:center;gap:9px;padding:26px 0 0}
  .show-more-button{min-width:220px;height:39px;display:flex;align-items:center;justify-content:center;gap:9px;padding:0 14px;border:1px solid #dce4f2;border-radius:9px;background:white;color:#315bc0;font-size:9px;font-weight:700;transition:.2s}
  .show-more-button:hover{border-color:#98b1ed;background:#f8faff}
  .show-more-button span{color:#9aa5b7;font-size:8px;font-weight:500}
  .results-progress{width:150px;height:3px;border-radius:5px;background:#e6eaf1;overflow:hidden}
  .results-progress span{display:block;height:100%;border-radius:5px;background:#3971eb;transition:width .25s}
  .show-more-wrap>small{font-size:8px;color:#9aa4b4}
  .product-skeleton{padding:9px;background:white;border:1px solid #e8ebf1;border-radius:12px}
  .skeleton-image,.skeleton-line{border-radius:6px;background:linear-gradient(90deg,#f0f2f6,#f8f9fb,#f0f2f6);background-size:200% 100%;animation:shimmer 1.5s infinite}
  .skeleton-image{height:140px;margin-bottom:14px}.skeleton-line{height:10px;margin-top:9px}.skeleton-line.short{width:45%}.skeleton-line.price-skeleton{width:60%;height:18px;margin-top:17px}
  @keyframes shimmer{to{background-position:-200% 0}}
  .error-state,.empty-state{min-height:330px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:35px;background:white;border:1px solid #e8ebf1;border-radius:13px}
  .error-icon,.empty-icon{width:54px;height:54px;display:grid;place-items:center;margin-bottom:13px;border-radius:17px;background:#fff0f1;color:#e45d6d}
  .empty-icon{background:#eff4ff;color:#4f77d6}
  .error-state h3,.empty-state h3{margin:0 0 7px;color:#273650;font-size:15px}
  .error-state p,.empty-state p{max-width:420px;color:#8792a5;font-size:10px;line-height:1.8}
  .error-state .primary-button{margin-top:8px}
  .secondary-button{padding:10px 15px;border:1px solid #dce4f2;border-radius:8px;background:white;color:#315bc0;font-size:10px;font-weight:700}
  .bottom-promise{display:flex;align-items:center;gap:13px;margin-bottom:38px;padding:17px 20px;border:1px solid #e6ecf5;border-radius:12px;background:linear-gradient(100deg,#fff,#f8faff)}
  .promise-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;color:#e95573;background:#fff0f3}
  .bottom-promise>div:nth-child(2){display:grid;gap:4px}.bottom-promise strong{color:#33425e;font-size:10px}.bottom-promise>div:nth-child(2) span{color:#8a95a8;font-size:8px}
  .promise-rating{display:flex;align-items:center;gap:5px;margin-left:auto;color:#d59b28;font-size:9px;font-weight:700}
  .site-footer{background:#fff;border-top:1px solid #e8ebf1}
  .footer-inner{min-height:58px;display:flex;align-items:center;justify-content:space-between;color:#929bad;font-size:8px}
  .footer-inner span:last-child{display:flex;align-items:center;gap:6px;color:#73829a}.footer-inner svg{color:#19a879}
  .modal-backdrop,.drawer-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:22px;background:#14213bb8;backdrop-filter:blur(4px);animation:fade-in .18s ease}
  @keyframes fade-in{from{opacity:0}to{opacity:1}}
  .modal-dialog{width:min(490px,100%);max-height:min(85vh,850px);overflow:auto;border-radius:16px;background:white;box-shadow:0 24px 80px #06112c45;animation:modal-in .2s ease}
  .modal-wide{width:min(1000px,100%)}
  @keyframes modal-in{from{transform:translateY(8px) scale(.99);opacity:.7}to{transform:translateY(0) scale(1);opacity:1}}
  .modal-heading{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#fff;border-bottom:1px solid #edf0f5}
  .modal-heading h2{margin:0;color:#20304c;font-size:15px;letter-spacing:-.3px}
  .icon-button{width:34px;height:34px;display:grid;place-items:center;border:1px solid #e8ebf1;border-radius:9px;background:white;color:#6f7b90}
  .icon-button:hover{background:#f5f7fb;color:#263858}
  .modal-body{padding:19px 20px}
  .modal-empty{min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .modal-empty-icon{width:56px;height:56px;display:grid;place-items:center;margin-bottom:13px;border-radius:16px;background:#eef3ff;color:#3566dc}
  .modal-empty strong{font-size:12px;color:#263650}.modal-empty p{max-width:310px;color:#8994a8;font-size:10px;line-height:1.8}
  .modal-empty button{margin-top:8px}
  .compare-content{overflow-x:auto}
  .compare-table{min-width:650px}
  .compare-row{display:grid;grid-template-columns:140px repeat(auto-fit,minmax(130px,1fr));border-bottom:1px solid #edf0f5}
  .compare-label,.compare-cell{padding:11px 10px;font-size:9px;line-height:1.6}
  .compare-label{color:#8490a4;font-weight:600;background:#fbfcfe}
  .compare-cell{color:#394862}
  .compare-header-row{align-items:stretch}
  .compare-header-row>.compare-label{display:flex;align-items:center}
  .compare-product-heading{position:relative;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:9px 12px 12px;border-left:1px solid #f0f2f6}
  .remove-compare{position:absolute;right:8px;top:7px;width:22px;height:22px;display:grid;place-items:center;border:0;border-radius:50%;background:#f3f5f8;color:#8993a4}
  .compare-image{width:100%;height:88px;overflow:hidden;border-radius:8px;background:#f1f4f8}.compare-image img{width:100%;height:100%;object-fit:cover}
  .compare-product-heading>strong{font-size:9px;line-height:1.5;color:#33425b}
  .compare-price{color:#1f3154;font-size:11px;font-weight:800}
  .compare-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:14px}
  .compare-actions .primary-button{font-size:9px}
  .drawer-backdrop{z-index:100;justify-content:flex-end;padding:0}
  .cart-drawer{width:min(440px,100%);height:100%;display:flex;flex-direction:column;background:#fff;box-shadow:-15px 0 50px #06112c25}
  .drawer-header{display:flex;align-items:center;justify-content:space-between;padding:20px 21px 16px;border-bottom:1px solid #edf0f5}
  .drawer-header .section-eyebrow{font-size:8px}
  .drawer-header h2{margin:5px 0 0;color:#1f2e49;font-size:18px;letter-spacing:-.5px}
  .drawer-header h2 span{color:#939db0;font-size:13px;font-weight:500}
  .drawer-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:25px;text-align:center}
  .drawer-empty-icon{width:65px;height:65px;display:grid;place-items:center;margin-bottom:14px;border-radius:20px;background:#eff4ff;color:#4872d9}
  .drawer-empty strong{color:#283750;font-size:13px}.drawer-empty p{max-width:260px;color:#8792a5;font-size:10px;line-height:1.8}
  .drawer-empty .primary-button{margin-top:10px}
  .cart-items-list{flex:1;overflow-y:auto;padding:4px 20px}
  .cart-item{position:relative;display:grid;grid-template-columns:74px 1fr 24px;gap:12px;padding:15px 0;border-bottom:1px solid #edf0f5}
  .cart-item-image{width:74px;height:74px;overflow:hidden;border-radius:9px;background:#f1f4f8}.cart-item-image img{width:100%;height:100%;object-fit:cover}
  .cart-item-info{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
  .cart-item-info>strong{width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:#35435c;font-size:9px;line-height:1.5}
  .cart-item-price{color:#1f3154;font-size:11px;font-weight:800}
  .remove-cart-item{width:24px;height:24px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#9aa4b3}
  .remove-cart-item:hover{background:#fff0f1;color:#da4c61}
  .quantity-control{height:25px;display:flex;align-items:center;gap:12px;margin-top:2px;border:1px solid #e6eaf0;border-radius:6px}
  .quantity-control button{width:24px;height:23px;display:grid;place-items:center;border:0;background:transparent;color:#5e6d84}
  .quantity-control span{min-width:11px;text-align:center;color:#34425a;font-size:9px;font-weight:700}
  .checkout-form{padding:16px 20px 18px;border-top:1px solid #edf0f5;background:#fcfdff}
  .cart-total-row{display:flex;align-items:center;justify-content:space-between;color:#58657a;font-size:11px}
  .cart-total-row strong{color:#1e2d49;font-size:18px;letter-spacing:-.6px}
  .installment-line{display:flex;align-items:center;gap:5px;margin:5px 0 13px;color:#19865f;font-size:9px}
  .checkout-form label,.quick-form label{display:grid;gap:5px;margin-top:9px;color:#53617a;font-size:9px;font-weight:600}
  .admin-login-form{display:grid;gap:12px;padding:3px 2px 2px}
  .admin-login-form>p{margin:0;color:#6f7d93;font-size:12px;line-height:1.6}
  .admin-login-form label{display:grid;gap:6px;color:#53617a;font-size:11px;font-weight:650}
  .admin-login-form input{height:42px;width:100%;padding:0 12px;border:1px solid #e3e8f0;border-radius:9px;outline:none;background:white;color:#263650;font:inherit}
  .admin-login-form input:focus{border-color:#91acf0;box-shadow:0 0 0 3px #2c63e711}
  .admin-login-form .admin-login-error{padding:9px 10px;border:1px solid #f1d8da;border-radius:8px;background:#fff7f7;color:#b9505a}
  .customer-auth-form{display:grid;gap:12px}
  .customer-auth-form>label{display:grid;gap:6px;color:#53617a;font-size:11px;font-weight:650}
  .customer-auth-form input{height:42px;width:100%;padding:0 12px;border:1px solid #e3e8f0;border-radius:9px;outline:none;background:white;color:#263650;font:inherit}
  .customer-auth-form input:focus{border-color:#91acf0;box-shadow:0 0 0 3px #2c63e711}
  .customer-auth-switch{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;border-radius:10px;background:#f2f4f8}
  .customer-auth-switch button{min-height:37px;padding:7px;border:0;border-radius:7px;background:transparent;color:#68758a;font:inherit;font-size:10px;font-weight:650}
  .customer-auth-switch button.active{background:white;color:#315ec6;box-shadow:0 2px 7px #26365012}
  .admin-login-page,.profile-auth-required{min-height:calc(100vh - 185px);display:flex;align-items:center;justify-content:center;padding:35px 18px}
  .admin-login-card{width:min(440px,100%);padding:30px;border:1px solid #e7ebf2;border-radius:18px;background:white;box-shadow:0 16px 50px #192c4b12}
  .admin-login-card .admin-login-icon{width:48px;height:48px;display:grid;place-items:center;margin-bottom:16px;border-radius:14px;background:#eef3ff;color:#4567ce}
  .admin-login-card h1{margin:8px 0;color:#25344f;font-size:25px}
  .admin-login-card>p{margin:0 0 20px;color:#77849a;font-size:12px;line-height:1.7}
  .profile-auth-required{flex-direction:column;text-align:center;color:#4567ce}
  .profile-auth-required h1{margin:14px 0 5px;color:#25344f;font-size:23px}
  .profile-auth-required p{max-width:440px;color:#77849a;font-size:12px;line-height:1.7}
  .profile-auth-required .primary-button{margin-top:9px;padding:0 22px}
  .checkout-form input,.quick-form input{width:100%;height:38px;padding:0 11px;border:1px solid #e3e8f0;border-radius:8px;outline:none;background:white;color:#263650;font-size:10px}
  .checkout-form input:focus,.quick-form input:focus{border-color:#91acf0;box-shadow:0 0 0 3px #2c63e711}
  .checkout-form input::placeholder,.quick-form input::placeholder{color:#abb3c0}
  .phone-input-row{display:grid;grid-template-columns:112px minmax(0,1fr);gap:7px}
  .phone-input-row input,.phone-input-row select{min-width:0;width:100%;height:38px;padding:0 9px;border:1px solid #e3e8f0;border-radius:8px;outline:none;background:white;color:#263650;font-size:10px}
  .phone-input-row input:focus,.phone-input-row select:focus{border-color:#91acf0;box-shadow:0 0 0 3px #2c63e711}
  .phone-input-row input::placeholder{color:#abb3c0}
  .checkout-form .phone-input-row input,.checkout-form .phone-input-row select{height:38px}
  .checkout-button{width:100%;height:42px;margin-top:13px}
  .checkout-note{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:9px;color:#8b96a8;font-size:8px}
  .checkout-note svg{color:#19a879}
  .quick-product{display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center;padding-bottom:14px;border-bottom:1px solid #edf0f5}
  .quick-image{width:72px;height:72px;overflow:hidden;border-radius:9px;background:#f1f4f8}.quick-image img{width:100%;height:100%;object-fit:cover}
  .quick-product>div:last-child{display:grid;gap:5px}.quick-product strong{color:#33425b;font-size:10px;line-height:1.5}
  .quick-price{color:#1e3154;font-size:14px;font-weight:800}
  .quick-form>p{margin:13px 0;color:#808ca1;font-size:10px;line-height:1.7}
  .quick-form label span{display:inline;color:#9ca6b6;font-size:8px;font-weight:400}
  .admin-coming{min-height:calc(100vh - 190px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:50px 20px}
  .admin-coming-icon{width:72px;height:72px;display:grid;place-items:center;margin-bottom:19px;border-radius:22px;background:#eaf0ff;color:#3266e4}
  .admin-coming .section-eyebrow{justify-content:center}
  .admin-coming h1{margin:10px 0;color:#1f2e49;font-size:30px;letter-spacing:-1px}
  .admin-coming p{max-width:480px;color:#7f8ba0;font-size:11px;line-height:1.9}
  .admin-coming .primary-button{margin-top:12px}
  .toast{position:fixed;z-index:80;right:24px;bottom:23px;max-width:min(400px,calc(100vw - 32px));display:flex;align-items:center;gap:10px;padding:13px 14px;border:1px solid #d8efe5;border-radius:10px;background:#fff;color:#31775c;box-shadow:0 10px 30px #15243a1c;font-size:10px;font-weight:600;animation:modal-in .2s ease}
  .toast-error{border-color:#f5d6da;color:#bd4354}
  .toast-close{width:22px;height:22px;display:grid;place-items:center;margin-left:4px;border:0;border-radius:5px;background:transparent;color:#8994a5}
  .customer-chat-root{position:fixed;z-index:45;right:24px;bottom:22px;font-family:Inter,Arial,sans-serif}
  .customer-chat-launcher{position:relative;min-height:49px;display:flex;align-items:center;gap:9px;padding:0 17px;border:0;border-radius:99px;background:linear-gradient(135deg,#2868ec,#1b4fc7);color:white;box-shadow:0 9px 24px #245be74a;transition:transform .2s,box-shadow .2s}
  .customer-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 12px 28px #245be75c}
  .customer-chat-launcher-label{font-size:10px;font-weight:700}
  .customer-chat-online{position:absolute;top:3px;left:34px;width:10px;height:10px;border:2px solid white;border-radius:50%;background:#20c483;box-shadow:0 0 0 3px #20c48328}
  .customer-chat-unread{position:absolute;top:-5px;right:-4px;min-width:19px;height:19px;display:grid;place-items:center;padding:0 4px;border:2px solid white;border-radius:99px;background:#ed4f66;color:white;font-size:8px;font-weight:800}
  .customer-chat-window{position:absolute;right:0;bottom:61px;width:min(360px,calc(100vw - 30px));height:min(540px,calc(100dvh - 105px));min-height:360px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e6eaf1;border-radius:17px;background:#fff;box-shadow:0 20px 60px #10214235;animation:modal-in .2s ease}
  .customer-chat-header{min-height:67px;display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(120deg,#1d4ebd,#3272ed);color:white}
  .customer-chat-avatar{width:37px;height:37px;flex:0 0 37px;display:grid;place-items:center;border:1px solid #ffffff3d;border-radius:12px;background:#ffffff20}
  .customer-chat-heading{min-width:0;flex:1;display:grid;gap:5px}
  .customer-chat-heading strong{font-size:10px}
  .customer-chat-heading small{display:flex;align-items:center;gap:6px;color:#dce7ff;font-size:8px}
  .customer-chat-heading small i{width:6px;height:6px;border-radius:50%;background:#38e29b;box-shadow:0 0 0 3px #38e29b2e}
  .customer-chat-close{width:29px;height:29px;display:grid;place-items:center;border:1px solid #ffffff45;border-radius:8px;background:#ffffff1a;color:white}
  .customer-chat-questions{display:grid;grid-template-columns:1fr;gap:5px;padding:10px 12px;border-bottom:1px solid #edf0f5;background:#fbfcfe}
  .customer-chat-questions>span{margin-bottom:1px;color:#8a96aa;font-size:7px;font-weight:700;letter-spacing:.4px}
  .customer-chat-questions button{justify-self:start;max-width:100%;padding:6px 9px;border:1px solid #e0e8f8;border-radius:99px;background:white;color:#48618c;text-align:left;font-size:7px;line-height:1.35;transition:.15s}
  .customer-chat-questions button:hover:not(:disabled){border-color:#a9bef0;background:#f3f6ff;color:#2e5dcc}
  .customer-chat-messages{flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;overflow-y:auto;padding:12px;background:#f7f9fc}
  .customer-chat-welcome{display:flex;align-items:flex-start;gap:8px;max-width:94%;padding:9px;border:1px solid #e8edf5;border-radius:10px 10px 10px 2px;background:white}
  .customer-welcome-icon{width:23px;height:23px;flex:0 0 23px;display:grid;place-items:center;border-radius:7px;background:#edf3ff;color:#3866ce}
  .customer-chat-welcome p{margin:2px 0;color:#58677f;font-size:8px;line-height:1.6}
  .customer-message{max-width:84%;display:grid;gap:4px;padding:8px 10px;border:1px solid #e5e9f0;border-radius:10px 10px 10px 2px;background:white;animation:modal-in .16s ease}
  .customer-message-own{align-self:flex-end;border-color:#dbe5ff;border-radius:10px 10px 2px 10px;background:#eaf1ff}
  .customer-message>small{color:#3964bd;font-size:7px;font-weight:700}
  .customer-message p{margin:0;color:#3d4d67;font-size:8px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
  .customer-message time{display:flex;align-items:center;justify-content:flex-end;gap:3px;color:#929db0;font-size:6px}
  .customer-message-own time svg{color:#3970dd}
  .customer-chat-loading{display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;color:#8794a9;font-size:8px}
  .customer-chat-error{padding:7px 8px;border:1px solid #f1d7dc;border-radius:7px;background:#fff7f8;color:#b24f5b;font-size:7px;line-height:1.6}
  .customer-chat-compose{display:grid;gap:6px;padding:9px 11px 8px;border-top:1px solid #e9edf3;background:white}
  .customer-name-label{display:flex;align-items:center;gap:8px;color:#7e899d;font-size:7px;font-weight:600}
  .customer-name-label input{height:27px;min-width:0;flex:1;padding:0 8px;border:1px solid #e4e9f1;border-radius:6px;outline:0;color:#35445d;font-size:8px}
  .customer-name-label input:focus,.customer-chat-compose form input:focus{border-color:#9bb4ed}
  .customer-name-label input::placeholder,.customer-chat-compose form input::placeholder{color:#a1abbb}
  .customer-chat-compose form{display:flex;gap:6px}
  .customer-chat-compose form input{height:37px;min-width:0;flex:1;padding:0 10px;border:1px solid #e2e7ef;border-radius:8px;outline:0;color:#34425b;font-size:8px}
  .customer-chat-compose form button{width:37px;height:37px;flex:0 0 37px;display:grid;place-items:center;border:0;border-radius:8px;background:#2c61dc;color:white}
  .customer-chat-compose form button:disabled{opacity:.5}
  .customer-chat-compose>small{color:#a0a9b7;text-align:center;font-size:6px}
  .customer-chat-spin{animation:customer-chat-rotate .8s linear infinite}
  @keyframes customer-chat-rotate{to{transform:rotate(360deg)}}
  .promotions-section{padding-top:17px}
  .promotion-banner{position:relative;min-height:196px;overflow:hidden;display:flex;align-items:center;justify-content:space-between;padding:27px 38px;border-radius:19px;background:linear-gradient(112deg,#183a92 0%,#285ce0 53%,#5747d5 100%);color:white;box-shadow:0 13px 30px #254cb327}
  .promotion-copy{position:relative;z-index:1;max-width:62%}
  .promotion-kicker{display:flex;align-items:center;gap:7px;color:#dce7ff;font-size:8px;font-weight:800;letter-spacing:1.2px}
  .promotion-copy h2{margin:12px 0 6px;font-size:24px;line-height:1.25;letter-spacing:-.7px;font-weight:800}
  .promotion-copy p{max-width:480px;margin:0;color:#d4e0ff;font-size:10px;line-height:1.7}
  .promotion-button{display:flex;align-items:center;gap:9px;margin-top:16px;padding:10px 13px;border:0;border-radius:8px;background:#fff;color:#2556cb;font-size:9px;font-weight:800;box-shadow:0 5px 13px #122a6750;transition:.2s}
  .promotion-button:hover{transform:translateY(-1px);background:#f1f5ff}
  .promotion-offer{position:relative;z-index:1;min-width:215px;display:flex;flex-direction:column;align-items:center;padding:15px 20px;border:1px solid #ffffff3b;border-radius:15px;background:#ffffff16;backdrop-filter:blur(8px)}
  .promotion-discount{color:#fff;font-size:30px;font-weight:800;letter-spacing:-1.3px;line-height:1}
  .promotion-offer-caption{margin-top:5px;color:#e0e8ff;font-size:8px}
  .promotion-ends{display:flex;align-items:center;gap:5px;margin:12px 0 7px;color:#e3eaff;font-size:8px}
  .countdown{display:flex;align-items:center;gap:7px}
  .countdown-unit{width:48px;display:grid;justify-items:center;gap:3px;padding:7px 4px;border:1px solid #ffffff2b;border-radius:7px;background:#142b7350}
  .countdown-unit strong{font-size:17px;line-height:1;font-variant-numeric:tabular-nums}
  .countdown-unit small{color:#d5e0ff;font-size:6px;letter-spacing:.8px}
  .promotion-date{display:flex;align-items:center;gap:4px;margin-top:9px;color:#d8e2ff;font-size:7px}
  .promotion-decoration{position:absolute;border:1px solid #ffffff1a;border-radius:50%;pointer-events:none}
  .promotion-decoration-one{width:330px;height:330px;right:20%;top:-180px}
  .promotion-decoration-two{width:240px;height:240px;right:31%;bottom:-185px}
  .promotion-spark{position:absolute;color:#ffffff83}
  .promotion-spark-one{right:41%;top:24px;font-size:20px}
  .promotion-spark-two{right:6%;bottom:20px;font-size:29px}
  .secondary-promotions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:10px}
  .secondary-promotion{min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 17px;border:1px solid #e8ebf2;border-radius:11px;background:white}
  .secondary-promotion>div{min-width:0;display:grid;gap:4px}
  .secondary-promotion>div>span{color:var(--promotion-color);font-size:8px;font-weight:800}
  .secondary-promotion strong{overflow:hidden;color:#35425a;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
  .secondary-promotion small{overflow:hidden;color:#8b96a9;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
  .secondary-promotion button{width:31px;height:31px;flex:0 0 31px;display:grid;place-items:center;border:0;border-radius:9px;background:color-mix(in srgb,var(--promotion-color) 10%,white);color:var(--promotion-color)}
  .promotions-error,.promotions-loading,.news-error,.news-loading{padding:18px;border:1px solid #e7ebf2;border-radius:11px;background:white;color:#7e899d;font-size:10px}
  .promotions-loading,.news-loading{display:flex;align-items:center;gap:9px}
  .news-section{padding:16px 0 49px}
  .news-heading{margin-bottom:20px}
  .news-heading-note{display:flex;align-items:center;gap:7px;padding-bottom:5px;color:#79879d;font-size:9px}
  .news-heading-note svg{color:#4b6fca}
  .news-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}
  .news-card{overflow:hidden;border:1px solid #e8ebf1;border-radius:12px;background:white;transition:transform .2s,box-shadow .2s}
  .news-card:hover{transform:translateY(-3px);box-shadow:0 12px 24px #1a2e4a12}
  .news-card-image{position:relative;height:137px;overflow:hidden;background:linear-gradient(135deg,#edf2fb,#e5ebf5)}
  .news-card-image>img,.article-modal-image>img{width:100%;height:100%;display:block;object-fit:cover}
  .news-image-fallback{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;background:radial-gradient(circle at 50% 40%,#fff,#edf2fb);color:#8299c8}
  .news-image-fallback span{font-size:8px;color:#8592aa}
  .news-date{display:flex;align-items:center;gap:5px;color:#75839a;font-size:8px}
  .news-card-image .news-date{position:absolute;left:9px;bottom:9px;padding:6px 8px;border:1px solid #fff9;border-radius:6px;background:#ffffffed;color:#5f6e86}
  .news-card-body{padding:12px 13px 13px}
  .news-category{color:#416bd1;font-size:7px;font-weight:800;letter-spacing:.8px}
  .news-card h3{height:34px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:7px 0 5px;color:#2d3b55;font-size:10px;line-height:1.6}
  .news-card p{height:40px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin:0;color:#8792a5;font-size:8px;line-height:1.65}
  .news-card-body>button{display:flex;align-items:center;gap:6px;margin-top:10px;padding:0;border:0;background:transparent;color:#2d5ed6;font-size:8px;font-weight:700}
  .news-card-body>button:hover{color:#173fae}
  .article-modal{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:22px;align-items:start}
  .article-modal-image{height:280px;overflow:hidden;border-radius:11px;background:#eef2f8}
  .article-modal-copy{padding:5px 4px 8px 0}
  .article-date{color:#7b879c}
  .article-modal-copy h2{margin:12px 0 9px;color:#263650;font-size:20px;line-height:1.35;letter-spacing:-.4px}
  .article-summary{margin:0;padding-bottom:13px;border-bottom:1px solid #edf0f5;color:#68778f;font-size:10px;line-height:1.8}
  .article-content{padding-top:12px;color:#46556e;font-size:10px;line-height:1.9;white-space:pre-line}
  .article-signature{display:flex;align-items:center;gap:7px;margin-top:17px;color:#5670a1;font-size:8px;font-weight:600}
  .article-signature svg{color:#3465df}
  .cart-drawer{max-height:100vh;max-height:100dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  .cart-items-list{flex:1 0 auto;min-height:80px}
  .cart-item-price{display:flex;align-items:baseline;gap:7px}
  .cart-item-price del{color:#9ba5b4;font-size:8px;font-weight:400}
  .checkout-form{flex:0 0 auto}
  .promo-code-form{margin-bottom:12px}
  .promo-code-form>label{display:flex;align-items:center;gap:6px;margin:0 0 7px;color:#52617a;font-size:9px;font-weight:700}
  .promo-code-form>label svg{color:#3265dc}
  .promo-code-controls{display:flex;gap:7px}
  .promo-code-controls input{height:35px;min-width:0;flex:1;text-transform:uppercase}
  .apply-promo-button,.promo-applied-button{display:flex;align-items:center;justify-content:center;gap:5px;padding:0 10px;border:1px solid #dce5f6;border-radius:8px;background:#f6f8ff;color:#315dca;font-size:8px;font-weight:700;white-space:nowrap}
  .promo-applied-button{border-color:#cfeadd;background:#eff9f4;color:#18865e}
  .cart-price-breakdown{display:grid;gap:6px;padding:0 0 9px}
  .cart-price-breakdown>div{display:flex;justify-content:space-between;gap:10px;color:#7b879b;font-size:8px}
  .cart-price-breakdown .saving-row{color:#16865f}
  .cart-total-row{padding-top:7px;border-top:1px solid #edf0f5}
  .cart-total-row strong{font-size:17px}
  .checkout-savings{margin-top:5px;color:#16865f;font-size:8px;font-weight:600;text-align:right}
  .payment-select{width:100%;height:38px;padding:0 10px;border:1px solid #e3e8f0;border-radius:8px;outline:none;background:white;color:#34435c;font-size:10px}
  .payment-select:focus{border-color:#91acf0;box-shadow:0 0 0 3px #2c63e711}
  .checkout-confirmation{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center}
  .confirmation-check{width:68px;height:68px;display:grid;place-items:center;margin-bottom:18px;border-radius:50%;background:#e8f8f0;color:#16a36f;box-shadow:0 0 0 9px #e8f8f04d}
  .checkout-confirmation .section-eyebrow{justify-content:center;font-size:8px}
  .checkout-confirmation h3{margin:10px 0 6px;color:#243651;font-size:21px}
  .checkout-confirmation>p{max-width:295px;color:#8290a4;font-size:10px;line-height:1.8}
  .confirmation-total{width:min(300px,100%);display:flex;align-items:center;justify-content:space-between;margin:16px 0 9px;padding:13px;border:1px solid #e9edf4;border-radius:10px;color:#758198;font-size:9px}
  .confirmation-total strong{color:#20304c;font-size:16px}
  .confirmation-payment{display:flex;align-items:center;gap:6px;margin-bottom:17px;color:#60806e;font-size:9px}
  .confirmation-payment svg{color:#18a878}
  .checkout-confirmation>.primary-button{height:40px}
  .language-switcher{display:flex;align-items:center;gap:2px;padding:3px;border:1px solid #e6eaf2;border-radius:9px;background:#f8f9fc}
  .language-switcher button{height:25px;min-width:28px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:#7a869b;font-size:8px;font-weight:800;letter-spacing:.3px}
  .language-switcher button.language-active{background:white;color:#315fd2;box-shadow:0 1px 5px #192b4d18}
  .pwa-install-wrap{position:relative}
  .pwa-install-button{height:35px;display:flex;align-items:center;gap:6px;padding:0 9px;border:1px solid #e2e8f4;border-radius:8px;background:white;color:#475873;font-size:8px;font-weight:700;white-space:nowrap}
  .pwa-install-button svg{color:#7050da}
  .pwa-installed{color:#2c9469}
  .pwa-install-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;background:#0008}
  .pwa-install-modal{width:min(384px,100%);max-height:min(90dvh,640px);overflow-y:auto;margin:0 auto;padding:20px;border:1px solid #e9edf4;border-radius:16px;background:#fff;box-shadow:0 24px 70px #07132b45}
  .pwa-install-popover-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#293852;font-size:14px}
  .pwa-install-popover-heading button{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;border:1px solid #e8ebf1;border-radius:8px;background:#f8f9fc;color:#67758c}
  .pwa-install-modal p{margin:13px 0 0;color:#6f7d93;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
  .pwa-install-modal .pwa-install-secure-note{padding:11px;border:1px solid #f1dfb8;border-radius:9px;background:#fff9ed;color:#9a6b22}
  .mobile-bottom-nav{display:none}
  .mobile-catalog-backdrop{position:fixed;inset:0;z-index:61;display:flex;align-items:flex-end;justify-content:center;padding:0;background:#101b33a8;backdrop-filter:blur(3px)}
  .mobile-catalog-sheet{width:min(600px,100%);max-height:min(86dvh,760px);display:flex;flex-direction:column;overflow:hidden;border-radius:20px 20px 0 0;background:white;box-shadow:0 -12px 50px #12234430}
  .mobile-sheet-heading{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid #edf0f5}
  .mobile-sheet-heading h2{margin:5px 0 0;color:#243450;font-size:16px}
  .mobile-sheet-content{display:grid;gap:13px;overflow:auto;padding:14px 18px}
  .mobile-sheet-content>strong{color:#35445d;font-size:10px}
  .mobile-sheet-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .mobile-sheet-categories button{min-height:37px;padding:7px 9px;border:1px solid #e6eaf1;border-radius:8px;background:white;color:#53617a;text-align:left;font-size:9px}
  .mobile-sheet-categories button.mobile-sheet-category-active{border-color:#9bb2eb;background:#f1f5ff;color:#2d5fd7;font-weight:700}
  .mobile-sheet-content>label,.mobile-sheet-price label{display:grid;gap:6px;color:#55637b;font-size:8px;font-weight:700}
  .mobile-sheet-content select,.mobile-sheet-price input{width:100%;height:37px;padding:0 9px;border:1px solid #e2e7ef;border-radius:7px;background:white;color:#35445d;font-size:9px}
  .mobile-sheet-price{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .mobile-sheet-discount{display:flex!important;align-items:center;gap:8px!important;padding:5px 0}
  .mobile-sheet-discount input{width:15px;height:15px;accent-color:#315fd8}
  .mobile-sheet-actions{display:flex;gap:8px;padding:11px 18px calc(13px + env(safe-area-inset-bottom));border-top:1px solid #edf0f5;background:white}
  .mobile-sheet-actions>*{flex:1}
  .mobile-nav-active{color:#5b2ab9!important}
  .mobile-cart-sticky{display:none}
  @media(max-width:850px){.promotion-banner{padding:24px;min-height:180px}.promotion-copy{max-width:57%}.promotion-copy h2{font-size:20px}.promotion-offer{min-width:195px;padding:13px}.news-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.news-card-image{height:155px}.article-modal-image{height:235px}}
  @media(max-width:767px){body{padding-bottom:calc(66px + env(safe-area-inset-bottom))}.top-nav{display:none}.mobile-bottom-nav{position:fixed;z-index:30;right:0;bottom:0;left:0;min-height:62px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:6px 6px calc(6px + env(safe-area-inset-bottom));border-top:1px solid #e7eaf1;background:#fffffffa;box-shadow:0 -4px 16px #1c31520d;backdrop-filter:blur(14px)}.mobile-bottom-nav button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:#7e899e;font-size:7px;font-weight:700}.mobile-bottom-nav button svg{stroke-width:1.8}.mobile-bottom-nav button.mobile-nav-active{color:#5530ba}.mobile-bottom-nav button.mobile-nav-active:before{content:"";position:absolute;top:-6px;width:25px;height:2px;border-radius:2px;background:#753ced}.mobile-bottom-nav .mobile-nav-cart b{position:absolute;top:1px;left:calc(50% + 3px);min-width:15px;height:15px;display:grid;place-items:center;padding:0 3px;border:1px solid white;border-radius:99px;background:#ef4e61;color:white;font-size:7px}.customer-chat-root{bottom:calc(75px + env(safe-area-inset-bottom))}.customer-chat-window{bottom:55px}.site-footer{padding-bottom:8px}.mobile-catalog-sheet{padding-bottom:env(safe-area-inset-bottom)}}
  @media(max-width:600px){.header-actions{width:100%;order:4;justify-content:space-between;gap:7px}.pwa-install-button{width:auto;height:32px;justify-content:center;padding:0 6px;font-size:7px}.pwa-install-label-full{display:none}.pwa-install-label-short{display:inline!important}.language-switcher{padding:2px}.language-switcher button{min-width:25px;height:24px;padding:0 5px}.header-action{padding:4px}.admin-toggle{height:32px;padding:0 8px}.header-actions .admin-toggle{font-size:8px}.header-main{gap:9px}.brand-logo{margin-right:auto}.search-box{order:3;flex:1 0 100%}.mobile-chat-trigger{display:none}}
  .pwa-install-label-short{display:none}
  @media(max-width:600px){.promotions-section{padding-top:12px}.promotion-banner{min-height:0;align-items:flex-start;gap:8px;padding:18px 14px;border-radius:14px}.promotion-copy{max-width:none;flex:1}.promotion-kicker{max-width:230px;font-size:6px;line-height:1.5;letter-spacing:.7px}.promotion-copy h2{max-width:245px;margin:9px 0 5px;font-size:16px}.promotion-copy p{max-width:245px;font-size:8px}.promotion-button{gap:5px;margin-top:11px;padding:9px;font-size:7px}.promotion-button svg{width:13px}.promotion-offer{min-width:0;width:114px;flex:0 0 114px;padding:11px 6px;margin-top:7px;border-radius:10px}.promotion-discount{font-size:19px}.promotion-offer-caption{font-size:6px}.promotion-ends{margin:9px 0 5px;font-size:6px}.promotion-ends svg{width:11px}.countdown{gap:3px}.countdown-unit{width:31px;padding:5px 2px}.countdown-unit strong{font-size:12px}.countdown-unit small{font-size:5px}.promotion-date{font-size:5px}.promotion-spark-one{right:33%;top:9px;font-size:14px}.promotion-spark-two{right:3%;bottom:7px;font-size:19px}.secondary-promotions{gap:6px;margin-top:7px}.secondary-promotion{min-height:66px;gap:5px;padding:9px;border-radius:9px}.secondary-promotion strong{font-size:7px}.secondary-promotion small{font-size:6px}.secondary-promotion>div>span{font-size:7px}.secondary-promotion button{width:25px;height:25px;flex-basis:25px}.news-section{padding:6px 0 30px}.news-heading{gap:8px}.news-heading-note{font-size:7px}.news-grid{gap:8px}.news-card-image{height:112px}.news-card-body{padding:9px}.news-card h3{height:31px;font-size:8px}.news-card p{font-size:7px;height:36px}.news-card-body>button{margin-top:7px;font-size:7px}.news-date{font-size:7px}.news-card-image .news-date{left:6px;bottom:6px;padding:5px 6px}.article-modal{grid-template-columns:1fr;gap:13px}.article-modal-image{height:190px}.article-modal-copy h2{font-size:16px}.article-content,.article-summary{font-size:9px}.cart-drawer{width:100%;max-height:100dvh}.cart-items-list{min-height:90px;padding:4px 15px}.cart-item{grid-template-columns:61px 1fr 22px;gap:9px;padding:11px 0}.cart-item-image{width:61px;height:61px}.cart-item-info>strong{font-size:8px}.checkout-form{max-height:64dvh;overflow-y:auto;padding:12px 15px 16px}.checkout-form label{margin-top:7px}.checkout-form input,.payment-select{height:35px}.promo-code-form{margin-bottom:9px}.promo-code-controls input{height:33px}.checkout-confirmation{min-height:65vh;padding:24px}}
  @media(max-width:1120px){.header-main{gap:20px}.header-actions{gap:15px}.admin-toggle{padding:0 10px}.hero-copy{width:57%;padding-left:42px}.hero-art{width:47%}.hero h1{font-size:36px}.trust-bar{padding:15px 10px}.trust-item{padding:0 9px}.trust-item strong{font-size:8px}.catalog-layout{grid-template-columns:190px minmax(0,1fr)}.product-grid{gap:10px}.product-visual{height:140px}.product-body{padding:10px}.product-actions{grid-template-columns:1fr}.quick-buy-button{height:28px}}
  @media(max-width:850px){.page-width{width:calc(100% - 36px)}.header-main{height:72px;gap:15px}.search-box{max-width:none}.search-box kbd{display:none}.header-actions{gap:12px}.header-action>span:last-child{display:none}.admin-toggle{height:36px;font-size:9px}.top-nav{height:43px}.nav-note{font-size:8px}.hero{min-height:340px}.hero-copy{width:60%;padding:39px 0 25px 31px}.hero h1{font-size:32px}.hero-art{width:45%;transform:scale(.88);transform-origin:center right}.hero-social-proof{margin-top:20px}.trust-bar{grid-template-columns:repeat(2,1fr);row-gap:15px}.trust-item:nth-child(2){border-right:0}.trust-item:nth-child(3){padding-top:7px}.trust-item:nth-child(4){padding-top:7px}.catalog-layout{grid-template-columns:1fr}.filter-panel{position:static;display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;padding:12px}.filter-heading{grid-column:1/-1;padding-bottom:8px}.filter-group{padding:7px 0;border:0}.discount-filter{align-self:center;border:0;padding:8px 0}.sidebar-promo,.sidebar-guarantee{display:none}.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:600px){body{min-width:340px}.page-width{width:calc(100% - 28px)}.header-main{height:auto;min-height:65px;flex-wrap:wrap;padding-top:11px;padding-bottom:10px;gap:10px}.brand-logo{gap:8px}.logo-mark{width:37px;height:37px;border-radius:11px}.logo-copy strong{font-size:18px}.logo-copy small{font-size:7px}.header-actions{gap:11px}.admin-toggle{height:32px;padding:0 8px;font-size:8px;gap:4px}.header-action-icon svg{width:18px}.search-box{order:3;flex:1 0 100%;height:39px}.search-box input{font-size:10px}.top-nav{gap:19px;height:39px}.nav-tab{font-size:9px}.nav-note{display:none}.hero{min-height:355px;margin-top:14px;border-radius:17px}.hero-copy{width:100%;padding:26px 20px 20px;z-index:2}.hero-eyebrow{font-size:7px;padding:6px 8px}.hero h1{font-size:31px;margin:14px 0 9px}.hero-copy>p{max-width:290px;font-size:10px;line-height:1.65}.hero-actions{gap:11px;align-items:flex-start;flex-direction:column;margin-top:16px}.hero-button{height:39px;font-size:9px}.hero-promise{font-size:8px}.hero-art{right:-57px;top:89px;width:65%;height:250px;transform:scale(.64);transform-origin:top right;opacity:.77}.hero-center{left:31%;top:46px}.hero-product-card{font-size:8px}.hero-discount{right:7%;bottom:0}.hero-social-proof{position:absolute;left:20px;bottom:18px;margin:0;font-size:8px}.hero-social-proof strong{font-size:9px}.hero-pagination{display:none}.trust-bar{margin-top:11px;padding:13px 8px;row-gap:12px;border-radius:12px}.trust-item{gap:7px;padding:0 5px}.trust-item:nth-child(3),.trust-item:nth-child(4){padding-top:0}.trust-icon{width:30px;height:30px;flex-basis:30px;border-radius:9px}.trust-icon svg{width:17px}.trust-item strong{font-size:7px}.trust-item small{font-size:7px}.catalog-section{padding:39px 0 33px}.section-heading{align-items:flex-start;gap:10px;flex-direction:column;margin-bottom:15px}.section-heading h2{font-size:23px}.section-heading p{max-width:340px;font-size:9px;line-height:1.6}.catalog-meta{padding:0;font-size:9px}.category-scroller{gap:6px;padding-bottom:10px}.category-pill{height:33px;padding:0 10px;font-size:8px}.catalog-layout{gap:9px}.filter-panel{grid-template-columns:1fr 1fr;gap:8px 11px;padding:10px}.filter-heading{grid-column:1/-1}.filter-group{padding:5px 0}.filter-label{font-size:8px}.select-wrap select{padding:9px 25px 9px 8px;font-size:8px}.price-inputs input{height:32px;font-size:8px}.discount-filter{font-size:8px}.results-toolbar{height:40px;align-items:flex-start}.results-summary{gap:4px;font-size:8px}.results-summary strong{font-size:9px}.sort-control{gap:4px}.sort-control>span{display:none}.sort-control select{max-width:125px;font-size:8px}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.product-visual{height:125px}.product-body{padding:8px}.product-brand,.product-rating{font-size:7px}.product-card h3{font-size:9px;height:29px}.product-specs{font-size:7px;height:25px}.price-line strong{font-size:14px}.price-line del{font-size:7px}.installment{font-size:6px}.product-actions{gap:4px;margin-top:8px}.add-cart-button,.quick-buy-button{height:30px;font-size:7px}.add-cart-button svg{width:13px}.compare-link{font-size:7px}.product-badges{top:6px;left:6px}.discount-badge,.status-badge{padding:4px 5px;font-size:7px}.favorite-button{top:6px;right:6px;width:25px;height:25px}.favorite-button svg{width:14px}.stock-label{bottom:6px;left:6px;padding:4px 5px;font-size:7px}.show-more-button{height:37px}.bottom-promise{padding:12px;gap:9px;margin-bottom:22px}.bottom-promise strong{font-size:8px}.bottom-promise>div:nth-child(2) span{font-size:7px;line-height:1.5}.promise-icon{width:31px;height:31px;flex:0 0 31px}.promise-rating{display:none}.footer-inner{min-height:55px;gap:12px;font-size:7px}.footer-inner span:last-child{font-size:7px}.modal-backdrop{padding:12px}.modal-heading{padding:14px 15px}.modal-body{padding:14px}.modal-dialog{border-radius:13px}.modal-heading h2{font-size:13px}.cart-drawer{width:100%}.checkout-form{padding:13px 16px}.drawer-header{padding:16px}.admin-coming h1{font-size:24px}.customer-chat-root{right:12px;bottom:12px}.customer-chat-launcher{min-height:45px;padding:0 13px}.customer-chat-launcher-label{font-size:9px}.customer-chat-window{right:-2px;bottom:55px;width:min(360px,calc(100vw - 24px));height:min(540px,calc(100dvh - 82px));min-height:340px}.customer-chat-online{left:30px}}
  @media(max-width:600px){.customer-chat-root{bottom:calc(75px + env(safe-area-inset-bottom))}}
`;

export default App;
