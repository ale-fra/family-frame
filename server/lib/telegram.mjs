import path from "node:path";

export function createTelegramService(runtime, photoStore, systemActions) {
  async function startTelegramPolling() {
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        timeout: "25",
        allowed_updates: JSON.stringify(["message"])
      });
      if (offset) params.set("offset", String(offset));

      try {
        const payload = await telegramApi("getUpdates", params);
        for (const update of payload.result || []) {
          offset = Math.max(offset, update.update_id + 1);
          await handleTelegramMessage(update.message);
        }
      } catch (error) {
        console.error("Telegram polling error:", error.message);
        await delay(5000);
      }
    }
  }

  async function handleTelegramMessage(message) {
    if (!message?.chat?.id) return;
    const chatId = String(message.chat.id);
    if (runtime.allowedTelegramChats.size > 0 && !runtime.allowedTelegramChats.has(chatId)) return;

    if (typeof message.text === "string" && message.text.trim().startsWith("/refresh")) {
      if (!systemActions.capabilities.refresh) {
        await telegramApi("sendMessage", new URLSearchParams({
          chat_id: chatId,
          text: "Aggiornamento del dispositivo non disponibile in questo ambiente."
        }));
        return;
      }
      const started = await systemActions.triggerRefresh(`telegram:${chatId}`);
      await telegramApi("sendMessage", new URLSearchParams({
        chat_id: chatId,
        text: started ? "Refresh avviato." : "Refresh gia in corso."
      }));
      return;
    }

    const photoSizes = Array.isArray(message.photo) ? message.photo : [];
    const document = message.document;
    const photoFile = photoSizes.at(-1);
    const fileId = photoFile?.file_id || (document?.mime_type?.startsWith("image/") ? document.file_id : "");
    if (!fileId) return;

    const filePayload = await telegramApi("getFile", new URLSearchParams({ file_id: fileId }));
    const filePath = filePayload.result?.file_path;
    if (!filePath) return;

    const fileResponse = await fetch(`https://api.telegram.org/file/bot${runtime.telegramToken}/${filePath}`);
    if (!fileResponse.ok) throw new Error(`Telegram file download failed: ${fileResponse.status}`);

    const arrayBuffer = await fileResponse.arrayBuffer();
    const mimeType = document?.mime_type || mimeTypeFromTelegramPath(filePath);
    const result = await photoStore.ingestBuffer(Buffer.from(arrayBuffer), {
      originalName: document?.file_name || path.basename(filePath),
      mimeType,
      source: "telegram"
    });

    if (result.accepted) {
      await telegramApi("sendMessage", new URLSearchParams({
        chat_id: chatId,
        text: "Foto ricevuta. La trovi nella coda da approvare del frame."
      }));
    }
  }

  async function telegramApi(method, params) {
    const response = await fetch(`https://api.telegram.org/bot${runtime.telegramToken}/${method}?${params.toString()}`);
    if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
    return response.json();
  }

  return {
    startTelegramPolling
  };
}

export function mimeTypeFromTelegramPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
