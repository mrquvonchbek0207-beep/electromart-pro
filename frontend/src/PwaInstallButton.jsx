import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { translate, useLanguage } from "./i18n.js";

export default function PwaInstallButton() {
  const { language } = useLanguage();
  const [installPrompt, setInstallPrompt] = useState(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true,
  );
  const [secureContext] = useState(() => window.isSecureContext);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setInstructionsOpen(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!instructionsOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setInstructionsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [instructionsOpen]);

  async function install() {
    if (installed) return;
    if (!installPrompt) {
      setInstructionsOpen((open) => !open);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      console.error("Не удалось открыть системное окно установки:", error);
      setInstructionsOpen(true);
      setInstallPrompt(null);
    }
  }

  return (
    <>
      <div className="pwa-install-wrap">
        <button
          type="button"
          className={`pwa-install-button ${installed ? "pwa-installed" : ""}`}
          onClick={install}
          aria-expanded={instructionsOpen}
          title={translate(language, installed ? "Приложение уже установлено" : "Установить приложение")}
        >
          <Download size={15} />
          <span className="pwa-install-label-full">{translate(language, installed ? "Приложение уже установлено" : "Установить приложение")}</span>
          <span className="pwa-install-label-short">{translate(language, installed ? "Установлено" : "Установить")}</span>
        </button>
      </div>
      {instructionsOpen && !installed && (
        createPortal(<div className="pwa-install-overlay" onMouseDown={(event) => event.target === event.currentTarget && setInstructionsOpen(false)}>
          <section className="pwa-install-modal" role="dialog" aria-modal="true" aria-label={translate(language, "Инструкция по установке")}>
            <div className="pwa-install-popover-heading">
              <strong>{translate(language, "Инструкция по установке")}</strong>
              <button type="button" aria-label={translate(language, "Закрыть")} onClick={() => setInstructionsOpen(false)}><X size={17} /></button>
            </div>
            {!secureContext && <p className="pwa-install-secure-note">{translate(language, "Для установки PWA по адресу локальной сети нужен HTTPS. Через HTTP сайт можно открыть, но браузер блокирует установку и автономный режим.")}</p>}
            <p>{translate(language, "На iPhone: нажмите «Поделиться», затем «На экран Домой». На Android: откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».")}</p>
          </section>
        </div>, document.body)
      )}
    </>
  );
}
