const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const ARQUIVO = "./mensagens.json";
const MAX_MSGS = 100;

let historicoSalas = {};
try {
  if (fs.existsSync(ARQUIVO))
    historicoSalas = JSON.parse(fs.readFileSync(ARQUIVO, "utf-8"));
} catch(e) { historicoSalas = {}; }

function salvar() {
  try { fs.writeFileSync(ARQUIVO, JSON.stringify(historicoSalas), "utf-8"); } catch(e) {}
}

function addMsg(sala, msg) {
  if (!historicoSalas[sala]) historicoSalas[sala] = [];
  const paraHistorico = { ...msg };
  if (paraHistorico.media) { paraHistorico.media = null; paraHistorico.semMidia = true; }
  historicoSalas[sala].push(paraHistorico);
  if (historicoSalas[sala].length > MAX_MSGS)
    historicoSalas[sala] = historicoSalas[sala].slice(-MAX_MSGS);
  salvar();
}

const server = http.createServer((req, res) => { res.writeHead(200); res.end("OK"); });

// Aumenta limite do WebSocket para 100MB
const wss = new WebSocket.Server({ server, maxPayload: 100 * 1024 * 1024 });
const usuarios = new Map();
const remetentes = new Map();

console.log(`Servidor na porta ${PORT}`);

wss.on("connection", (ws) => {
  ws.on("message", (dados) => {
    try {
      const msg = JSON.parse(dados);
      const usuario = usuarios.get(ws);

      if (msg.tipo === "entrar") {
        const sala = msg.sala || "geral";
        for (const [c, d] of usuarios.entries()) {
          if (d.nome === msg.nome && d.sala === sala && c !== ws) {
            usuarios.delete(c);
            try { c.terminate(); } catch(e) {}
          }
        }
        usuarios.set(ws, { nome: msg.nome, sala });
        ws.send(JSON.stringify({ tipo: "historico", mensagens: historicoSalas[sala] || [] }));
        broadcast({ tipo: "sistema", texto: `${msg.nome} entrou no chat`, hora: hora() }, sala, ws);
        broadcastOnline(sala);
        return;
      }

      if (!usuario) return;

      if (["mensagem", "imagem", "audio"].includes(msg.tipo)) {
        // Usa o ID do cliente para manter consistência de status
        const id = msg.clientId || Date.now().toString();
        const novaMsg = {
          id,
          tipo: msg.tipo,
          nome: usuario.nome,
          texto: msg.texto || "",
          media: msg.media || null,
          mediaType: msg.mediaType || null,
          hora: hora(),
          replyTo: msg.replyTo || null,
          reacoes: {}
        };
        addMsg(usuario.sala, novaMsg);

        // Confirma ID pro remetente
        ws.send(JSON.stringify({ tipo: "confirmado", clientId: msg.clientId, id }));

        const count = broadcast(novaMsg, usuario.sala, ws);
        remetentes.set(id, ws);

        // Avisa remetente sobre entrega
        if (count > 0)
          ws.send(JSON.stringify({ tipo: "status", id, status: "entregue" }));
        return;
      }

      if (msg.tipo === "apagar") {
        if (historicoSalas[usuario.sala]) {
          const idx = historicoSalas[usuario.sala].findIndex(m => m.id === msg.id && m.nome === usuario.nome);
          if (idx !== -1) { historicoSalas[usuario.sala].splice(idx, 1); salvar(); }
        }
        broadcast({ tipo: "apagar", id: msg.id }, usuario.sala, null);
        return;
      }

      if (msg.tipo === "reagir") {
        if (historicoSalas[usuario.sala]) {
          const m = historicoSalas[usuario.sala].find(m => m.id === msg.id);
          if (m) {
            if (!m.reacoes) m.reacoes = {};
            if (!m.reacoes[msg.emoji]) m.reacoes[msg.emoji] = [];
            const idx = m.reacoes[msg.emoji].indexOf(usuario.nome);
            if (idx === -1) m.reacoes[msg.emoji].push(usuario.nome);
            else {
              m.reacoes[msg.emoji].splice(idx, 1);
              if (!m.reacoes[msg.emoji].length) delete m.reacoes[msg.emoji];
            }
            salvar();
            // Manda pra TODOS incluindo o remetente (não atualiza localmente no cliente)
            broadcastTodos({ tipo: "reagir", id: msg.id, reacoes: m.reacoes }, usuario.sala);
          }
        }
        return;
      }

      if (msg.tipo === "digitando")
        broadcast({ tipo: "digitando", nome: usuario.nome }, usuario.sala, ws);

      if (msg.tipo === "parou")
        broadcast({ tipo: "parou", nome: usuario.nome }, usuario.sala, ws);

      if (msg.tipo === "visto") {
        for (const id of (msg.ids || [])) {
          const sw = remetentes.get(id);
          if (sw && sw.readyState === WebSocket.OPEN && sw !== ws)
            sw.send(JSON.stringify({ tipo: "status", id, status: "visto" }));
        }
      }

    } catch(e) { console.error(e); }
  });

  ws.on("close", () => {
    const u = usuarios.get(ws);
    if (u) {
      broadcast({ tipo: "sistema", texto: `${u.nome} saiu`, hora: hora() }, u.sala);
      broadcast({ tipo: "parou", nome: u.nome }, u.sala, ws);
      usuarios.delete(ws);
      broadcastOnline(u.sala);
    }
  });
});

function broadcast(dados, sala, excluir = null) {
  const json = JSON.stringify(dados);
  let count = 0;
  wss.clients.forEach(c => {
    if (c.readyState !== WebSocket.OPEN || c === excluir) return;
    const u = usuarios.get(c);
    if (u && u.sala === sala) { c.send(json); count++; }
  });
  return count;
}

// Broadcast para TODOS incluindo o remetente
function broadcastTodos(dados, sala) {
  const json = JSON.stringify(dados);
  wss.clients.forEach(c => {
    if (c.readyState !== WebSocket.OPEN) return;
    const u = usuarios.get(c);
    if (u && u.sala === sala) c.send(json);
  });
}

function broadcastOnline(sala) {
  const lista = [...usuarios.values()].filter(u => u.sala === sala).map(u => u.nome);
  const json = JSON.stringify({ tipo: "usuarios_online", lista });
  wss.clients.forEach(c => {
    if (c.readyState !== WebSocket.OPEN) return;
    const u = usuarios.get(c);
    if (u && u.sala === sala) c.send(json);
  });
}

function hora() {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"
  });
}

server.listen(PORT, "0.0.0.0", () => console.log(`Rodando na porta ${PORT}`));
