(function () {
  const script = document.currentScript;
  if (!script) return;

  const widgetId = script.dataset.widgetId;
  const apiBase = script.dataset.apiBase || script.src.replace(/\/widget\.js.*$/, "");

  if (!widgetId) {
    console.error("widget.js: missing data-widget-id");
    return;
  }

  const rootId = `chatbot-root-${widgetId}`;
  if (document.getElementById(rootId)) return;

  const storageKey = `chatbot_session_${widgetId}`;
  const sessionId = localStorage.getItem(storageKey) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);
  localStorage.setItem(storageKey, sessionId);

  const root = document.createElement("div");
  root.id = rootId;
  document.body.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

    #${rootId} {
      --cb-primary: #0f172a;
      --cb-primary-text: #ffffff;
      --cb-panel-bg: #ffffff;
      --cb-panel-muted: #f4f7fb;
      --cb-border: #dbe4ef;
      --cb-shadow: 0 26px 48px rgba(8, 15, 35, 0.22);
      --cb-text: #0c1222;
      --cb-bot-bubble: #ecf2f9;
      --cb-user-bubble: #111827;
      --cb-user-text: #ffffff;
      --cb-radius: 18px;
      --cb-fast: 180ms;
      --cb-mobile-vh: 100vh;
    }

    #${rootId} *, #${rootId} *::before, #${rootId} *::after {
      box-sizing: border-box;
      font-family: Manrope, "Avenir Next", "Segoe UI", sans-serif;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    #chatbot-btn-${widgetId} {
      position: fixed;
      right: 22px;
      bottom: 22px;
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      cursor: pointer;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.01em;
      z-index: 999999;
      background: linear-gradient(135deg, var(--cb-primary), color-mix(in srgb, var(--cb-primary) 80%, #4f46e5));
      color: var(--cb-primary-text);
      box-shadow: 0 14px 28px rgba(2, 6, 23, 0.28);
      transition: transform var(--cb-fast) ease, box-shadow var(--cb-fast) ease, opacity var(--cb-fast) ease;
    }

    #chatbot-backdrop-${widgetId} {
      position: fixed;
      inset: 0;
      background: rgba(2, 8, 23, 0.28);
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease;
      z-index: 999998;
    }

    #chatbot-backdrop-${widgetId}.open {
      opacity: 1;
      pointer-events: auto;
    }

    #chatbot-btn-${widgetId}:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 30px rgba(2, 6, 23, 0.32);
    }

    #chatbot-panel-${widgetId} {
      position: fixed;
      right: 22px;
      bottom: 80px;
      width: 370px;
      max-width: calc(100vw - 20px);
      height: min(560px, calc(100vh - 110px));
      border-radius: var(--cb-radius);
      overflow: hidden;
      box-shadow: var(--cb-shadow);
      display: none;
      flex-direction: column;
      background: var(--cb-panel-bg);
      border: 1px solid color-mix(in srgb, var(--cb-primary) 16%, #dbe4ef);
      z-index: 999999;
      transform: translateY(12px) scale(0.98);
      opacity: 0;
      transition: transform 220ms ease, opacity 220ms ease;
      touch-action: manipulation;
    }

    #chatbot-panel-${widgetId}.open {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    #chatbot-header-${widgetId} {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 14px 14px;
      font-weight: 800;
      font-size: 14px;
      background: linear-gradient(125deg, var(--cb-primary), color-mix(in srgb, var(--cb-primary) 76%, #334155));
      color: var(--cb-primary-text);
    }

    #chatbot-header-name-${widgetId} {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #chatbot-close-${widgetId} {
      border: 0;
      background: rgba(255, 255, 255, 0.18);
      color: var(--cb-primary-text);
      border-radius: 999px;
      width: 26px;
      height: 26px;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    #chatbot-messages-${widgetId} {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 10px;
      background:
        radial-gradient(circle at 0% 0%, #ffffff, #f7fafd 52%),
        radial-gradient(circle at 100% 100%, #eff5ff, #f4f8ff 50%);
      color: var(--cb-text);
    }

    .chatbot-row {
      margin: 8px 0;
      display: flex;
    }

    .chatbot-user {
      justify-content: flex-end;
    }

    .chatbot-bubble {
      display: inline-block;
      max-width: 88%;
      padding: 10px 12px;
      border-radius: 14px;
      line-height: 1.38;
      font-size: 13px;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
      animation: cbIn 160ms ease;
    }

    .chatbot-user .chatbot-bubble {
      background: var(--cb-user-bubble);
      color: var(--cb-user-text);
      border-bottom-right-radius: 5px;
    }

    .chatbot-bot .chatbot-bubble {
      background: var(--cb-bot-bubble);
      color: var(--cb-text);
      border-bottom-left-radius: 5px;
      border: 1px solid #d9e4f2;
    }

    #chatbot-form-${widgetId} {
      display: flex;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid var(--cb-border);
      background: #fff;
    }

    #chatbot-input-${widgetId} {
      flex: 1;
      border: 1px solid #ced9e7;
      border-radius: 12px;
      padding: 10px 11px;
      font-size: 13px;
      color: var(--cb-text);
      outline: none;
      background: #fcfeff;
      transition: border-color var(--cb-fast) ease, box-shadow var(--cb-fast) ease;
    }

    #chatbot-input-${widgetId}:focus {
      border-color: color-mix(in srgb, var(--cb-primary) 35%, #9ab3d1);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--cb-primary) 18%, #d8e7f7);
    }

    #chatbot-send-${widgetId} {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      background: var(--cb-primary);
      color: var(--cb-primary-text);
      transition: transform var(--cb-fast) ease, opacity var(--cb-fast) ease;
    }

    #chatbot-send-${widgetId}:disabled {
      opacity: 0.5;
      cursor: default;
    }

    #chatbot-send-${widgetId}:not(:disabled):hover {
      transform: translateY(-1px);
    }

    .chatbot-typing {
      display: inline-flex;
      gap: 3px;
      align-items: center;
      height: 14px;
    }

    .chatbot-typing i {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: #5b6b81;
      animation: cbDot 1s infinite ease-in-out;
    }

    .chatbot-typing i:nth-child(2) { animation-delay: .12s; }
    .chatbot-typing i:nth-child(3) { animation-delay: .24s; }

    @keyframes cbDot {
      0%, 80%, 100% { transform: translateY(0); opacity: .4; }
      40% { transform: translateY(-3px); opacity: 1; }
    }

    @keyframes cbIn {
      from { transform: translateY(4px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    @media (max-width: 640px) {
      #chatbot-btn-${widgetId} {
        right: 14px;
        bottom: calc(14px + env(safe-area-inset-bottom));
        padding: 12px 16px;
        font-size: 14px;
      }

      #chatbot-panel-${widgetId} {
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        max-width: 100vw;
        height: calc(var(--cb-mobile-vh) - 8px);
        max-height: calc(var(--cb-mobile-vh) - 8px);
        border-radius: 18px 18px 0 0;
        border-left: 0;
        border-right: 0;
        border-bottom: 0;
        transition: none;
      }

      #chatbot-backdrop-${widgetId},
      #chatbot-btn-${widgetId},
      #chatbot-send-${widgetId},
      .chatbot-bubble {
        transition: none;
        animation: none;
      }

      #chatbot-header-${widgetId} {
        padding: 16px;
        font-size: 15px;
      }

      #chatbot-close-${widgetId} {
        width: 34px;
        height: 34px;
        font-size: 20px;
      }

      #chatbot-messages-${widgetId} {
        padding: 14px 14px 8px;
      }

      .chatbot-bubble {
        max-width: 92%;
        padding: 11px 13px;
        font-size: 15px;
        line-height: 1.44;
      }

      #chatbot-form-${widgetId} {
        padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
      }

      #chatbot-input-${widgetId} {
        font-size: 16px;
        padding: 12px 12px;
      }

      #chatbot-send-${widgetId} {
        font-size: 14px;
        padding: 12px 15px;
      }
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = `chatbot-btn-${widgetId}`;
  btn.type = "button";
  btn.textContent = "Ask Us";

  const backdrop = document.createElement("div");
  backdrop.id = `chatbot-backdrop-${widgetId}`;

  const panel = document.createElement("div");
  panel.id = `chatbot-panel-${widgetId}`;

  const header = document.createElement("div");
  header.id = `chatbot-header-${widgetId}`;

  const headerName = document.createElement("div");
  headerName.id = `chatbot-header-name-${widgetId}`;
  headerName.textContent = "Support Assistant";

  const closeBtn = document.createElement("button");
  closeBtn.id = `chatbot-close-${widgetId}`;
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.textContent = "×";

  header.appendChild(headerName);
  header.appendChild(closeBtn);

  const messages = document.createElement("div");
  messages.id = `chatbot-messages-${widgetId}`;

  const form = document.createElement("form");
  form.id = `chatbot-form-${widgetId}`;

  const input = document.createElement("input");
  input.id = `chatbot-input-${widgetId}`;
  input.placeholder = "Ask about pricing, hours, policies...";
  input.autocomplete = "off";

  const send = document.createElement("button");
  send.id = `chatbot-send-${widgetId}`;
  send.type = "button";
  send.textContent = "Send";

  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(form);

  root.appendChild(backdrop);
  root.appendChild(btn);
  root.appendChild(panel);

  function appendMessage(role, text, htmlNode) {
    const row = document.createElement("div");
    row.className = `chatbot-row ${role === "user" ? "chatbot-user" : "chatbot-bot"}`;

    const bubble = document.createElement("div");
    bubble.className = "chatbot-bubble";
    if (htmlNode) {
      bubble.appendChild(htmlNode);
    } else {
      bubble.textContent = text;
    }

    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function setOpen(open) {
    panel.style.display = open ? "flex" : "none";
    panel.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) input.focus();
  }

  function bindFastTap(element, handler) {
    const supportsPointer = "PointerEvent" in window;
    const onActivate = function (event) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      handler();
    };

    if (supportsPointer) {
      element.addEventListener(
        "pointerdown",
        function (event) {
          if (event.button !== undefined && event.button !== 0) return;
          onActivate(event);
        },
        { passive: false }
      );
    } else {
      element.addEventListener("touchstart", onActivate, { passive: false });
      element.addEventListener("click", onActivate, { passive: false });
    }

    element.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") onActivate(event);
    });
  }

  function updateMobileViewportHeight() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    root.style.setProperty("--cb-mobile-vh", `${Math.round(height)}px`);
  }

  updateMobileViewportHeight();
  window.addEventListener("resize", updateMobileViewportHeight);
  window.addEventListener("orientationchange", updateMobileViewportHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateMobileViewportHeight);
    window.visualViewport.addEventListener("scroll", updateMobileViewportHeight);
  }

  bindFastTap(btn, function () {
    setOpen(panel.style.display !== "flex");
  });

  bindFastTap(backdrop, function () {
    setOpen(false);
  });

  bindFastTap(closeBtn, function () {
    setOpen(false);
  });

  bindFastTap(send, function () {
    if (!send.disabled) {
      form.requestSubmit();
    }
  });

  appendMessage("bot", "Hi, how can I help you?");

  let pendingController = null;
  let pendingTimeout = null;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    appendMessage("user", message);
    input.value = "";
    send.disabled = true;

    const typing = document.createElement("span");
    typing.className = "chatbot-typing";
    typing.innerHTML = "<i></i><i></i><i></i>";
    const typingRow = appendMessage("bot", "", typing);

    try {
      pendingController = new AbortController();
      pendingTimeout = setTimeout(function () {
        if (pendingController) pendingController.abort();
      }, 15000);

      const response = await fetch(`${apiBase}/api/public/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: pendingController.signal,
        body: JSON.stringify({ widgetId, message, sessionId })
      });

      const data = await response.json();
      typingRow.remove();

      if (!response.ok) {
        appendMessage("bot", data.error || "Request failed.");
      } else {
        appendMessage("bot", data.answer || "No answer returned.");
      }
    } catch (err) {
      typingRow.remove();
      appendMessage("bot", "Network error. Please try again.");
    } finally {
      if (pendingTimeout) clearTimeout(pendingTimeout);
      pendingController = null;
      pendingTimeout = null;
      send.disabled = false;
      input.focus();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && pendingController) {
      pendingController.abort();
    }
  });

  fetch(`${apiBase}/api/public/widget/${widgetId}/config`)
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.theme) return;
      const primary = data.theme.primaryColor || "#0f172a";
      const text = data.theme.textColor || "#ffffff";
      root.style.setProperty("--cb-primary", primary);
      root.style.setProperty("--cb-primary-text", text);
      headerName.textContent = `${data.businessName || "Support"} Assistant`;
      btn.textContent = `Chat with ${data.businessName || "Us"}`;
    })
    .catch(() => {});
})();
