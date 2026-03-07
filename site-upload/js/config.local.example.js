/*
  Copie este arquivo para js/config.local.js e ajuste somente localmente.
  Nunca versionar token/chave de API no frontend.

  Importante: para Pix real com segurança, use backend próprio e deixe o token no servidor.
*/
window.__APP_LOCAL_CONFIG__ = {
  API_MODE: "real",
  PIX_MODE: "proxy",
  ENDPOINTS: {
    auth: "https://SEU-BACKEND/api/auth",
    wallet: "https://SEU-BACKEND/api/wallet",
    trades: "https://SEU-BACKEND/api/trades",
    pix: "https://SEU-BACKEND/api/pix",
    awards: "https://SEU-BACKEND/api/awards",
    admin: "https://SEU-BACKEND/api/admin",
    content: "https://SEU-BACKEND/api/content",
    support: "https://SEU-BACKEND/api/support",
    affiliates: "https://SEU-BACKEND/api/affiliates",
  },
};
