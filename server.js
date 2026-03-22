// ============================================
//   SERVIDOR DO SEU APP DE MENSAGENS
//   Tecnologia: Node.js + WebSocket
// ============================================

const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

// Cria o servidor HTTP
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Servidor de chat rodando!");
});

// Cria o servidor WebSocket em cima do HTTP
const wss = new WebSocket.Server({ server });

// Guarda todos os usuários conectados
// Formato: { ws: conexão, nome: "João", sala: "geral" }
const usuarios = new Map();

console.log(`🚀 Servidor iniciado na porta ${PORT}`);

wss.on("connection", (ws) => {
  console.log("✅ Nova conexão recebida");

  // Quando recebe uma mensagem
  ws.on("message", (dados) => {
    try {
      const msg = JSON.parse(dados);

      // --- TIPO 1: Usuário entrando no chat ---
      if (msg.tipo === "entrar") {
        usuarios.set(ws, { nome: msg.nome, sala: msg.sala || "geral" });

        console.log(`👤 ${msg.nome} entrou na sala "${msg.sala || "geral"}"`);

        // Avisa todo mundo na sala que alguém entrou
        broadcast({
          tipo: "sistema",
          texto: `${msg.nome} entrou no chat`,
          hora: horaAtual()
        }, msg.sala || "geral", ws);

        // Manda a lista de usuários online pra quem acabou de entrar
        const onlineNaSala = [...usuarios.values()]
          .filter(u => u.sala === (msg.sala || "geral"))
          .map(u => u.nome);

        ws.send(JSON.stringify({
          tipo: "usuarios_online",
          lista: onlineNaSala
        }));
      }

      // --- TIPO 2: Mensagem normal ---
      if (msg.tipo === "mensagem") {
        const usuario = usuarios.get(ws);
        if (!usuario) return;

        console.log(`💬 [${usuario.sala}] ${usuario.nome}: ${msg.texto}`);

        // Envia pra todo mundo na mesma sala
        broadcast({
          tipo: "mensagem",
          nome: usuario.nome,
          texto: msg.texto,
          hora: horaAtual()
        }, usuario.sala);
      }

    } catch (e) {
      console.error("Erro ao processar mensagem:", e);
    }
  });

  // Quando um usuário desconecta
  ws.on("close", () => {
    const usuario = usuarios.get(ws);
    if (usuario) {
      console.log(`❌ ${usuario.nome} saiu`);

      broadcast({
        tipo: "sistema",
        texto: `${usuario.nome} saiu do chat`,
        hora: horaAtual()
      }, usuario.sala);

      usuarios.delete(ws);
    }
  });
});

// Envia mensagem pra todos na mesma sala
// Se "excluir" for passado, não envia pra essa conexão específica
function broadcast(dados, sala, excluir = null) {
  const json = JSON.stringify(dados);

  wss.clients.forEach((cliente) => {
    if (cliente.readyState !== WebSocket.OPEN) return;
    if (cliente === excluir) return;

    const usuario = usuarios.get(cliente);
    if (usuario && usuario.sala === sala) {
      cliente.send(json);
    }
  });
}

// Retorna a hora atual formatada (ex: "14:32")
function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

server.listen(PORT, () => {
  console.log(`🌐 Acesse em: http://localhost:${PORT}`);
});
