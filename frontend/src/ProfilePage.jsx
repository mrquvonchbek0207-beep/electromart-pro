import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, LogOut, PackageCheck, Pencil, UserRound } from "lucide-react";
import { API_URL } from "./api.js";
import { formatPrice, localizeProductText } from "./i18n.js";
import "./ProfilePage.css";

const EMPTY_PROFILE = {
  first_name: "",
  last_name: "",
  middle_name: "",
  birth_date: "",
  gender: "",
  phone: "",
  email: "",
};

const ORDER_STATUSES = {
  Новый: { ru: "Новый", uz: "Yangi", en: "New" },
  "В обработке": { ru: "В обработке", uz: "Jarayonda", en: "Processing" },
  Доставляется: { ru: "Доставляется", uz: "Yetkazilmoqda", en: "Delivering" },
  Выполнен: { ru: "Выполнен", uz: "Bajarildi", en: "Completed" },
  Отменён: { ru: "Отменён", uz: "Bekor qilindi", en: "Cancelled" },
};

function parseOrderItems(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items;
  } catch {
    return [];
  }
  return [];
}

function formatDate(value, language) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(language === "uz" ? "uz-UZ" : language === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function ProfilePage({
  user,
  token,
  language,
  onUserUpdated,
  onLogout,
  onNavigate,
  onLanguageChange,
}) {
  const [activeTab, setActiveTab] = useState("orders");
  const [profile, setProfile] = useState({ ...EMPTY_PROFILE, ...(user || {}) });
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const text = useCallback((ru, uz, en) => language === "uz" ? uz : language === "en" ? en : ru, [language]);

  const loadProfile = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) {
      onLogout();
      return;
    }
    if (!response.ok) throw new Error(text("Не удалось загрузить профиль.", "Profilni yuklab bo‘lmadi.", "Could not load your profile."));
    const data = await response.json();
    setProfile({ ...EMPTY_PROFILE, ...data });
    onUserUpdated(data);
  }, [onLogout, onUserUpdated, text, token]);

  const loadOrders = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/users/me/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) {
      onLogout();
      return;
    }
    if (!response.ok) throw new Error(text("Не удалось загрузить заказы.", "Buyurtmalarni yuklab bo‘lmadi.", "Could not load your orders."));
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(text("Сервер вернул неверный формат заказов.", "Server buyurtmalarni noto‘g‘ri formatda qaytardi.", "The server returned an invalid orders response."));
    setOrders(data);
  }, [onLogout, text, token]);

  useEffect(() => {
    let active = true;
    async function load() {
      setError("");
      setLoadingProfile(true);
      setLoadingOrders(true);
      try {
        await Promise.all([loadProfile(), loadOrders()]);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) {
          setLoadingProfile(false);
          setLoadingOrders(false);
        }
      }
    }
    load();
    return () => { active = false; };
  }, [loadOrders, loadProfile]);

  function updateField(event) {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(data?.detail || text("Не удалось сохранить изменения.", "O‘zgarishlarni saqlab bo‘lmadi.", "Could not save your changes."));
      setProfile({ ...EMPTY_PROFILE, ...data });
      onUserUpdated(data);
      setNotice(text("Данные профиля сохранены.", "Profil ma’lumotlari saqlandi.", "Profile saved."));
    } catch (saveError) {
      setError(saveError.message || text("Не удалось связаться с сервером.", "Server bilan bog‘lanib bo‘lmadi.", "Could not connect to the server."));
    } finally {
      setSaving(false);
    }
  }

  const fullName = [profile.last_name, profile.first_name, profile.middle_name].filter(Boolean).join(" ") || text("Покупатель", "Xaridor", "Customer");

  return (
    <main className="profile-page page-width">
      <div className="profile-heading">
        <div className="profile-avatar"><UserRound size={27} /></div>
        <div className="profile-heading-copy">
          <span className="section-eyebrow">{text("ЛИЧНЫЙ КАБИНЕТ", "SHAXSIY KABINET", "MY ACCOUNT")}</span>
          <h1>{fullName}</h1>
          <p>{profile.phone}</p>
        </div>
        <button className="profile-edit-shortcut" onClick={() => setActiveTab("settings")}><Pencil size={15} />{text("Изменить", "Tahrirlash", "Edit")}</button>
      </div>

      <div className="profile-layout">
        <aside className="profile-sidebar">
          <button className={activeTab === "orders" ? "profile-tab active" : "profile-tab"} onClick={() => setActiveTab("orders")}><PackageCheck size={17} />{text("Мои заказы", "Buyurtmalarim", "My orders")}<ChevronRight size={15} /></button>
          <button className={activeTab === "settings" ? "profile-tab active" : "profile-tab"} onClick={() => setActiveTab("settings")}><UserRound size={17} />{text("Настройки профиля", "Profil sozlamalari", "Profile settings")}<ChevronRight size={15} /></button>
          <div className="profile-quick-links">
            <h3>{text("Быстрый доступ", "Tezkor havolalar", "Quick links")}</h3>
            <button onClick={() => onNavigate("/")}>{text("Промокоды", "Promokodlarim", "My promo codes")}<ChevronRight size={14} /></button>
            <button onClick={() => onNavigate("/#news")}>{text("Отзывы и советы", "Sharhlarim", "Reviews & advice")}<ChevronRight size={14} /></button>
            <label>{text("Язык приложения", "Ilova tili", "App language")}
              <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
                <option value="uz">O‘zbekcha</option><option value="ru">Русский</option><option value="en">English</option>
              </select>
            </label>
          </div>
          <button className="profile-logout" onClick={onLogout}><LogOut size={16} />{text("Выйти", "Chiqish", "Log out")}</button>
        </aside>

        <section className="profile-content">
          {error && <div className="profile-alert profile-alert-error" role="alert">{error}</div>}
          {notice && <div className="profile-alert profile-alert-success" role="status">{notice}</div>}
          {activeTab === "orders" ? (
            <div>
              <div className="profile-section-heading"><div><span className="section-eyebrow">{text("ИСТОРИЯ ПОКУПОК", "XARIDLAR TARIXI", "PURCHASE HISTORY")}</span><h2>{text("Мои заказы", "Buyurtmalarim", "My orders")}</h2></div><span className="profile-order-count">{orders.length}</span></div>
              {loadingOrders ? <div className="profile-loading">{text("Загружаем заказы…", "Buyurtmalar yuklanmoqda…", "Loading orders…")}</div> : orders.length ? (
                <div className="profile-orders">
                  {orders.map((order) => {
                    const items = parseOrderItems(order.items_json);
                    const status = ORDER_STATUSES[order.status] || { ru: order.status || "Новый", uz: order.status || "Yangi", en: order.status || "New" };
                    return (
                      <article className="profile-order-card" key={order.id}>
                        <div className="profile-order-top">
                          <div><strong>№{order.id}</strong><span><CalendarDays size={13} />{formatDate(order.created_at, language)}</span></div>
                          <span className={`profile-order-status status-${String(order.status || "").replaceAll(" ", "-").toLowerCase()}`}>{status[language]}</span>
                        </div>
                        <div className="profile-order-items">
                          {items.map((item, index) => {
                            const itemName = item.name || item.product_name || text("Товар", "Mahsulot", "Item");
                            return <div key={`${item.product_id || item.sku || itemName}-${index}`}><span>{localizeProductText(itemName, language)} × {item.quantity || 1}</span><strong>{formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1), language)}</strong></div>;
                          })}
                        </div>
                        <div className="profile-order-total"><span>{text("Итого", "Jami", "Total")}</span><strong>{formatPrice(order.total_price, language)}</strong></div>
                      </article>
                    );
                  })}
                </div>
              ) : <div className="profile-empty"><PackageCheck size={30} /><h3>{text("Пока нет заказов", "Hozircha buyurtmalar yo‘q", "No orders yet")}</h3><p>{text("Ваши покупки появятся здесь после оформления заказа.", "Buyurtmalaringiz rasmiylashtirilgandan so‘ng shu yerda ko‘rinadi.", "Your purchases will appear here after checkout.")}</p><button className="primary-button" onClick={() => onNavigate("/")}>{text("Перейти в каталог", "Katalogga o‘tish", "Browse the catalog")}</button></div>}
            </div>
          ) : (
            <div>
              <div className="profile-section-heading"><div><span className="section-eyebrow">{text("ЛИЧНЫЕ ДАННЫЕ", "SHAXSIY MA’LUMOTLAR", "PERSONAL DETAILS")}</span><h2>{text("Настройки профиля", "Profil sozlamalari", "Profile settings")}</h2></div></div>
              {loadingProfile ? <div className="profile-loading">{text("Загружаем профиль…", "Profil yuklanmoqda…", "Loading profile…")}</div> : (
                <form className="profile-form" onSubmit={saveProfile}>
                  <label>{text("Фамилия", "Familiya", "Last name")}<input name="last_name" value={profile.last_name || ""} onChange={updateField} maxLength={100} /></label>
                  <label>{text("Имя", "Ism", "First name")}<input name="first_name" value={profile.first_name || ""} onChange={updateField} required maxLength={100} /></label>
                  <label>{text("Отчество", "Otasining ismi", "Middle name")}<input name="middle_name" value={profile.middle_name || ""} onChange={updateField} maxLength={100} /></label>
                  <label>{text("Дата рождения", "Tug‘ilgan sana", "Birth date")}<input name="birth_date" value={profile.birth_date || ""} onChange={updateField} placeholder={text("ДД/ММ/ГГГГ", "КК/ОО/ЙЙЙЙ", "DD/MM/YYYY")} pattern="(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/[0-9]{4}" maxLength={10} /></label>
                  <fieldset><legend>{text("Пол", "Jins", "Gender")}</legend><label className="profile-radio"><input type="radio" name="gender" value="male" checked={profile.gender === "male"} onChange={updateField} />{text("Мужской", "Erkak", "Male")}</label><label className="profile-radio"><input type="radio" name="gender" value="female" checked={profile.gender === "female"} onChange={updateField} />{text("Женский", "Ayol", "Female")}</label></fieldset>
                  <label>{text("Телефон", "Telefon", "Phone")}<input type="tel" name="phone" value={profile.phone || ""} onChange={updateField} required placeholder="+998901234567" pattern="\\+998[0-9]{9}" /></label>
                  <label>{text("Электронная почта", "Elektron pochta", "Email")}<input type="email" name="email" value={profile.email || ""} onChange={updateField} maxLength={254} /></label>
                  <button className="primary-button profile-save" type="submit" disabled={saving}>{saving ? text("Сохраняем…", "Saqlanmoqda…", "Saving…") : text("Сохранить изменения", "O‘zgarishlarni saqlash", "Save changes")}</button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
