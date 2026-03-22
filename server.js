// ============================================
//   SERVIDOR DO SEU APP DE MENSAGENS
//   Tecnologia: Node.js + WebSocket
// ============================================

const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const ARQUIVO_MENSAGENS = "./mensagens.json";
const MAX_MSGS_POR_SALA = 200;

// ---- Carrega mensagens salvas do disco ----
let historicoSalas = {};
try {
  if (fs.existsSync(ARQUIVO_MENSAGENS)) {
    historicoSalas = JSON.parse(fs.readFileSync(ARQUIVO_MENSAGENS, "utf-8"));
    console.log("📂 Histórico carregado do disco");
  }
} catch (e) {
  historicoSalas = {};
}

function salvarHistorico() {
  try { fs.writeFileSync(ARQUIVO_MENSAGENS, JSON.stringify(historicoSalas), "utf-8"); }
  catch (e) { console.error("Erro ao salvar:", e); }
}

function adicionarMsgAoHistorico(sala, msg) {
  if (!historicoSalas[sala]) historicoSalas[sala] = [];
  historicoSalas[sala].push(msg);
  if (historicoSalas[sala].length > MAX_MSGS_POR_SALA)
    historicoSalas[sala] = historicoSalas[sala].slice(-MAX_MSGS_POR_SALA);
  salvarHistorico();
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Servidor de chat rodando!");
});

const wss = new WebSocket.Server({ server });
const usuarios = new Map();

console.log(`🚀 Servidor iniciado na porta ${PORT}`);

wss.on("connection", (ws) => {
  ws.on("message", (dados) => {
    try {
      const msg = JSON.parse(dados);

      if (msg.tipo === "entrar") {
        const sala = msg.sala || "geral";
        usuarios.set(ws, { nome: msg.nome, sala });
        console.log(`👤 ${msg.nome} entrou em "${sala}"`);
        // Envia histórico pra quem entrou
        ws.send(JSON.stringify({ tipo: "historico", mensagens: historicoSalas[sala] || [] }));
        broadcast({ tipo: "sistema", texto: `${msg.nome} entrou no chat`, hora: horaAtual() }, sala, ws);
        broadcastOnline(sala);
      }

      if (msg.tipo === "mensagem") {
        const usuario = usuarios.get(ws);
        if (!usuario) return;
        const novaMsg = {
          id: Date.now().toString(),
          tipo: "mensagem",
          nome: usuario.nome,
          texto: msg.texto,
          hora: horaAtual()
        };
        adicionarMsgAoHistorico(usuario.sala, novaMsg);
        broadcast(novaMsg, usuario.sala, ws);
      }

      if (msg.tipo === "apagar") {
        const usuario = usuarios.get(ws);
        if (!usuario) return;
        const sala = usuario.sala;
        if (historicoSalas[sala]) {
          const idx = historicoSalas[sala].findIndex(m => m.id === msg.id && m.nome === usuario.nome);
          if (idx !== -1) {
            historicoSalas[sala].splice(idx, 1);
            salvarHistorico();
            broadcast({ tipo: "apagar", id: msg.id }, sala, null);
            console.log(`🗑️ ${usuario.nome} apagou mensagem ${msg.id}`);
          }
        }
      }

    } catch (e) { console.error("Erro:", e); }
  });

  ws.on("close", () => {
    const usuario = usuarios.get(ws);
    if (usuario) {
      broadcast({ tipo: "sistema", texto: `${usuario.nome} saiu do chat`, hora: horaAtual() }, usuario.sala);
      usuarios.delete(ws);
      broadcastOnline(usuario.sala);
    }
  });
});

function broadcastOnline(sala) {
  const lista = [...usuarios.values()].filter(u => u.sala === sala).map(u => u.nome);
  const json = JSON.stringify({ tipo: "usuarios_online", lista });
  wss.clients.forEach(c => {
    if (c.readyState !== WebSocket.OPEN) return;
    const u = usuarios.get(c);
    if (u && u.sala === sala) c.send(json);
  });
}

function broadcast(dados, sala, excluir = null) {
  const json = JSON.stringify(dados);
  wss.clients.forEach(c => {
    if (c.readyState !== WebSocket.OPEN) return;
    if (c === excluir) return;
    const u = usuarios.get(c);
    if (u && u.sala === sala) c.send(json);
  });
}

function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
