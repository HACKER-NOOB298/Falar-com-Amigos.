const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const ARQUIVO = "./mensagens.json";
const MAX_MSGS = 150;

let historicoSalas = {};
const salasSenhas = {}; // sala -> senha
try {
  if (fs.existsSync(ARQUIVO))
    historicoSalas = JSON.parse(fs.readFileSync(ARQUIVO, "utf-8"));
} catch(e) { historicoSalas = {}; }

function salvar() {
  try { fs.writeFileSync(ARQUIVO, JSON.stringify(historicoSalas), "utf-8"); } catch(e) {}
}

function addMsg(sala, msg) {
  if (!historicoSalas[sala]) historicoSalas[sala] = [];
  const h = { ...msg };
  if (h.media) { h.media = null; h.semMidia = true; }
  historicoSalas[sala].push(h);
  if (historicoSalas[sala].length > MAX_MSGS)
    historicoSalas[sala] = historicoSalas[sala].slice(-MAX_MSGS);
  salvar();
}

function updateMsgHistorico(sala, id, campos) {
  if (!historicoSalas[sala]) return;
  const idx = historicoSalas[sala].findIndex(m => m.id === id);
  if (idx !== -1) Object.assign(historicoSalas[sala][idx], campos);
  salvar();
}

const server = http.createServer((req, res) => { res.writeHead(200); res.end("MeuChat OK"); });
const wss = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

// usuarios: ws -> { nome, sala }
const usuarios = new Map();
// perfis: nome -> { foto, bio }
const perfis = new Map();
// remetentes: msgId -> ws
const remetentes = new Map();

console.log("Servidor iniciado na porta " + PORT);

wss.on("connection", (ws) => {
  ws.on("message", (dados) => {
    try {
      const msg = JSON.parse(dados);
      const usuario = usuarios.get(ws);

      // ---- ENTRAR ----
      if (msg.tipo === "definir_senha") {
        const sala = usuarios.get(ws)?.sala;
        if(sala){
          salasSenhas[sala] = msg.senha || null;
          broadcast({tipo:"sistema",texto:"Sala protegida com senha"+(msg.senha?"":" removida"),hora:hora()},sala,ws);
        }
        return;
      }

      if (msg.tipo === "entrar") {
        const sala = msg.sala || "geral";
        // Remove conexões duplicadas do mesmo nome+sala
        for (const [c, d] of usuarios.entries()) {
          if (d.nome === msg.nome && d.sala === sala && c !== ws) {
            usuarios.delete(c);
            try { c.terminate(); } catch(e) {}
          }
        }
        usuarios.set(ws, { nome: msg.nome, sala });
        // Envia histórico
        ws.send(JSON.stringify({ tipo: "historico", mensagens: historicoSalas[sala] || [] }));
        // Envia perfis existentes
        const perfisObj = {};
        for (const [n, p] of perfis.entries()) perfisObj[n] = p;
        ws.send(JSON.stringify({ tipo: "perfis", perfis: perfisObj }));
        broadcast({ tipo: "sistema", texto: `${msg.nome} entrou no chat`, hora: hora() }, sala, ws);
        broadcastOnline(sala);
        return;
      }

      if (!usuario) return;

      // ---- MENSAGENS ----
      if (["mensagem","imagem","audio","localizacao","contato","enquete"].includes(msg.tipo)) {
        const id = msg.clientId || Date.now().toString();
        const novaMsg = {
          id, tipo: msg.tipo, nome: usuario.nome,
          texto: msg.texto || "", media: msg.media || null,
          mediaType: msg.mediaType || null, hora: hora(),
          replyTo: msg.replyTo || null, reacoes: {},
          // campos especiais
          lat: msg.lat || null, lng: msg.lng || null,
          contatoNome: msg.contatoNome || null,
          opcoes: msg.opcoes || null, votos: msg.votos || null
        };
        addMsg(usuario.sala, novaMsg);
        ws.send(JSON.stringify({ tipo: "confirmado", clientId: msg.clientId, id }));
        const count = broadcast(novaMsg, usuario.sala, ws);
        remetentes.set(id, ws);
        if (count > 0) ws.send(JSON.stringify({ tipo: "status", id, status: "entregue" }));
        return;
      }

      // ---- APAGAR ----
      if (msg.tipo === "apagar") {
        if (historicoSalas[usuario.sala]) {
          const idx = historicoSalas[usuario.sala].findIndex(m => m.id === msg.id && m.nome === usuario.nome);
          if (idx !== -1) { historicoSalas[usuario.sala].splice(idx, 1); salvar(); }
        }
        broadcastTodos({ tipo: "apagar", id: msg.id }, usuario.sala);
        return;
      }

      // ---- REAGIR ----
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
            broadcastTodos({ tipo: "reagir", id: msg.id, reacoes: m.reacoes }, usuario.sala);
          }
        }
        return;
      }

      // ---- VOTAR ENQUETE ----
      if (msg.tipo === "votar") {
        if (historicoSalas[usuario.sala]) {
          const m = historicoSalas[usuario.sala].find(m => m.id === msg.id && m.tipo === "enquete");
          if (m) {
            if (!m.votos) m.votos = {};
            // Remove voto anterior deste usuario
            for (const k of Object.keys(m.votos)) {
              m.votos[k] = (m.votos[k] || []).filter(n => n !== usuario.nome);
            }
            if (!m.votos[msg.opcao]) m.votos[msg.opcao] = [];
            m.votos[msg.opcao].push(usuario.nome);
            salvar();
            broadcastTodos({ tipo: "votar_update", id: msg.id, votos: m.votos }, usuario.sala);
          }
        }
        return;
      }

      // ---- PERFIL ----
      if (msg.tipo === "perfil") {
        const p = perfis.get(usuario.nome) || {};
        if (msg.foto !== undefined) p.foto = msg.foto;
        if (msg.bio !== undefined) p.bio = msg.bio;
        perfis.set(usuario.nome, p);
        broadcastTodos({ tipo: "perfil_update", nome: usuario.nome, ...p }, usuario.sala);
        return;
      }

      // ---- DIGITANDO ----
      if (msg.tipo === "digitando") { broadcast({ tipo: "digitando", nome: usuario.nome }, usuario.sala, ws); return; }
      if (msg.tipo === "parou") { broadcast({ tipo: "parou", nome: usuario.nome }, usuario.sala, ws); return; }

      // ---- VISTO ----
      if (msg.tipo === "visto") {
        for (const id of (msg.ids || [])) {
          const sw = remetentes.get(id);
          if (sw && sw.readyState === WebSocket.OPEN && sw !== ws)
            sw.send(JSON.stringify({ tipo: "status", id, status: "visto" }));
        }
        return;
      }

      // ---- WEBRTC SIGNALING ----
      if (["call_offer","call_answer","call_reject","call_end","ice_candidate"].includes(msg.tipo)) {
        // Roteia para usuário específico pelo nome
        for (const [c, d] of usuarios.entries()) {
          if (d.nome === msg.to && c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ ...msg, from: usuario.nome }));
            break;
          }
        }
        return;
      }

      if(["call_offer","call_answer","call_reject","call_end","ice_candidate","call_chunk"].includes(msg.tipo)) {
        let entregue = false;
        for (const [c, d] of usuarios.entries()) {
          if (d.nome === msg.to && c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ ...msg, from: usuario.nome }));
            entregue = true;
            break;
          }
        }
        if (!entregue && msg.tipo === "call_offer") {
          ws.send(JSON.stringify({ tipo: "call_reject", from: msg.to, motivo: "offline" }));
        }
        return;
      }

      // ---- LIMPAR CONVERSA ----
      if (msg.tipo === "limpar") {
        historicoSalas[usuario.sala] = [];
        salvar();
        broadcastTodos({ tipo: "limpar" }, usuario.sala);
        return;
      }

    } catch(e) { console.error("Erro:", e.message); }
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
  return new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

server.listen(PORT, "0.0.0.0", () => console.log("Rodando na porta " + PORT));
