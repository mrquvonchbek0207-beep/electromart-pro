import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Ошибка отображения приложения:", error);
  }

  render() {
    if (this.state.failed) {
      const language = document.documentElement.lang;
      const message = language === "uz"
        ? "Sahifani ko‘rsatishda xatolik yuz berdi. Sahifani yangilang."
        : language === "en"
          ? "Something went wrong while displaying this page. Please refresh."
          : "Не удалось отобразить страницу. Обновите её.";
      return <main role="alert" style={{ maxWidth: 560, margin: "15vh auto", padding: 24, textAlign: "center", fontFamily: "Inter, sans-serif" }}>{message}</main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && (window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Не удалось зарегистрировать service worker:", error);
    });
  });
}
