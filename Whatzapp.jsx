import { useState, useRef, useEffect } from "react";

const CONTACTS = [
  { id: 1, name: "Maria Silva", phone: "+55 82 99876-5432", avatar: "MS", color: "#25D366", lastMsg: "Oi! Tudo bem?", time: "10:32", unread: 2 },
  { id: 2, name: "João Pedro", phone: "+55 82 98765-4321", avatar: "JP", color: "#128C7E", lastMsg: "Viu o jogo ontem?", time: "09:15", unread: 0 },
  { id: 3, name: "Ana Beatriz", phone: "+55 11 97654-3210", avatar: "AB", color: "#075E54", lastMsg: "Manda o endereço", time: "Ontem", unread: 1 },
  { id: 4, name: "Lucas Mendes", phone: "+55 21 96543-2109", avatar: "LM", color: "#34B7F1", lastMsg: "Beleza, até mais!", time: "Ontem", unread: 0 },
  { id: 5, name: "Carla Souza", phone: "+55 31 95432-1098", avatar: "CS", color: "#ECB22E", lastMsg: "kkkkk verdade", time: "Dom", unread: 0 },
];

const INITIAL_MSGS = {
  1: [
    { id: 1, from: "them", text: "Oi! Tudo bem?", time: "10:30" },
    { id: 2, from: "them", text: "Sumiu hein", time: "10:32" },
  ],
  2: [
    { id: 1, from: "them", text: "Eai mano", time: "09:10" },
    { id: 2, from: "them", text: "Viu o jogo ontem?", time: "09:15" },
  ],
  3: [
    { id: 1, from: "me", text: "Vai rolar sim!", time: "Ontem" },
    { id: 2, from: "them", text: "Manda o endereço", time: "Ontem" },
  ],
  4: [
    { id: 1, from: "me", text: "Falou!", time: "Ontem" },
    { id: 2, from: "them", text: "Beleza, até mais!", time: "Ontem" },
  ],
  5: [
    { id: 1, from: "them", text: "Isso foi demais kkkkk", time: "Dom" },
    { id: 2, from: "them", text: "kkkkk verdade", time: "Dom" },
  ],
};

function Avatar({ name, color, size = 42 }) {
  const initials = name.split(" ").slice(0, 2).map(n => n[0]).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff", fontWeight: 600,
      fontSize: size * 0.35, flexShrink: 0, fontFamily: "'Segoe UI', sans-serif"
    }}>{initials}</div>
  );
}

async function getAIReply(contactName, userMessage, history) {
  const historyText = history.slice(-6).map(m =>
    `${m.from === "me" ? "Usuário" : contactName}: ${m.text}`
  ).join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Você é ${contactName}, um amigo brasileiro do usuário conversando pelo WhatsApp. 
Responda de forma casual, curta e natural como um amigo responderia no WhatsApp. 
Use gírias brasileiras quando apropriado. Máximo 2 frases curtas.
Não use emojis em excesso. Seja natural e espontâneo.

Histórico recente:
${historyText}

${contactName}: (responda à última mensagem do usuário de forma natural)`
      }]
    })
  });
  const data = await response.json();
  return data.content?.[0]?.text?.trim() || "oi!";
}

export default function Whatzapp() {
  const [screen, setScreen] = useState("login");
  const [phone, setPhone] = useState("");
  const [myName, setMyName] = useState("");
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState(INITIAL_MSGS);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [contacts, setContacts] = useState(CONTACTS);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChat, typing]);

  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    return val;
  };

  const handleLogin = () => {
    if (phone.replace(/\D/g, "").length >= 10) {
      setScreen("chats");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeChat) return;
    const text = input.trim();
    setInput("");
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newMsg = { id: Date.now(), from: "me", text, time };

    setMessages(prev => ({
      ...prev,
      [activeChat.id]: [...(prev[activeChat.id] || []), newMsg]
    }));

    setContacts(prev => prev.map(c =>
      c.id === activeChat.id ? { ...c, lastMsg: text, time } : c
    ));

    setTyping(true);
    try {
      const history = [...(messages[activeChat.id] || []), newMsg];
      const reply = await getAIReply(activeChat.name, text, history);
      const replyMsg = { id: Date.now() + 1, from: "them", text: reply, time };
      setMessages(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), replyMsg]
      }));
      setContacts(prev => prev.map(c =>
        c.id === activeChat.id ? { ...c, lastMsg: reply, time } : c
      ));
    } catch {
      const fallback = { id: Date.now() + 1, from: "them", text: "oi, tô sem sinal aqui kkk", time };
      setMessages(prev => ({
        ...prev,
        [activeChat.id]: [...(prev[activeChat.id] || []), fallback]
      }));
    }
    setTyping(false);
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const colors = ["#25D366", "#128C7E", "#075E54", "#34B7F1", "#ECB22E", "#E91E63", "#9C27B0"];
    const newContact = {
      id: Date.now(),
      name: newName.trim(),
      phone: newPhone.trim(),
      avatar: newName.trim().split(" ").slice(0,2).map(n=>n[0]).join(""),
      color: colors[Math.floor(Math.random() * colors.length)],
      lastMsg: "Novo contato",
      time: "",
      unread: 0
    };
    setContacts(prev => [newContact, ...prev]);
    setMessages(prev => ({ ...prev, [newContact.id]: [] }));
    setNewName(""); setNewPhone(""); setShowNew(false);
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const openChat = (contact) => {
    setActiveChat(contact);
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread: 0 } : c));
  };

  // LOGIN SCREEN
  if (screen === "login") {
    return (
      <div style={{
        minHeight: 600, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "linear-gradient(160deg, #075E54 0%, #128C7E 40%, #25D366 100%)",
        fontFamily: "'Segoe UI', sans-serif", padding: 24
      }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: "48px 40px",
          width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          textAlign: "center"
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "#25D366", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 4px 20px rgba(37,211,102,0.4)"
          }}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M22 4C12.06 4 4 12.06 4 22c0 3.18.84 6.16 2.3 8.74L4 40l9.5-2.28A17.93 17.93 0 0022 40c9.94 0 18-8.06 18-18S31.94 4 22 4z" fill="#fff"/>
              <path d="M32 27.4c-.5-.25-2.96-1.46-3.42-1.63-.46-.17-.79-.25-1.12.25-.33.5-1.29 1.63-1.58 1.96-.29.33-.58.37-1.08.12-.5-.25-2.1-.77-4-2.46-1.48-1.32-2.48-2.95-2.77-3.45-.29-.5-.03-.77.22-1.02.22-.22.5-.58.75-.87.25-.29.33-.5.5-.83.17-.33.08-.62-.04-.87-.12-.25-1.12-2.7-1.54-3.7-.4-.97-.82-.84-1.12-.85H16c-.29 0-.75.12-1.14.58-.4.46-1.5 1.47-1.5 3.58s1.54 4.16 1.75 4.45c.21.29 3.02 4.62 7.32 6.47 1.02.44 1.82.7 2.44.9.73.23 1.4.2 1.92.12.59-.09 1.8-.74 2.05-1.45.25-.71.25-1.32.17-1.45-.08-.13-.29-.21-.79-.46z" fill="#25D366"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#111", margin: "0 0 8px" }}>WhatZapp</h1>
          <p style={{ color: "#666", fontSize: 14, margin: "0 0 36px", lineHeight: 1.5 }}>
            Entre com seu número para começar a conversar
          </p>

          <div style={{ textAlign: "left", marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "#666", fontWeight: 600, letterSpacing: 0.5 }}>
              SEU NOME
            </label>
            <input
              type="text"
              placeholder="Como você quer ser chamado?"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 10,
                border: "1.5px solid #e0e0e0", fontSize: 15, marginTop: 6,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                transition: "border-color .2s"
              }}
              onFocus={e => e.target.style.borderColor = "#25D366"}
              onBlur={e => e.target.style.borderColor = "#e0e0e0"}
            />
          </div>

          <div style={{ textAlign: "left", marginBottom: 28 }}>
            <label style={{ fontSize: 12, color: "#666", fontWeight: 600, letterSpacing: 0.5 }}>
              SEU NÚMERO
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <div style={{
                padding: "12px 12px", borderRadius: 10, border: "1.5px solid #e0e0e0",
                fontSize: 15, color: "#333", background: "#f9f9f9", whiteSpace: "nowrap"
              }}>🇧🇷 +55</div>
              <input
                type="tel"
                placeholder="(82) 99999-9999"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 10,
                  border: "1.5px solid #e0e0e0", fontSize: 15,
                  outline: "none", boxSizing: "border-box", fontFamily: "inherit"
                }}
                onFocus={e => e.target.style.borderColor = "#25D366"}
                onBlur={e => e.target.style.borderColor = "#e0e0e0"}
              />
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={phone.replace(/\D/g, "").length < 10}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: phone.replace(/\D/g,"").length >= 10 ? "#25D366" : "#ccc",
              color: "#fff", fontSize: 16, fontWeight: 700, border: "none",
              cursor: phone.replace(/\D/g,"").length >= 10 ? "pointer" : "default",
              transition: "all .2s", fontFamily: "inherit",
              boxShadow: phone.replace(/\D/g,"").length >= 10 ? "0 4px 16px rgba(37,211,102,0.4)" : "none"
            }}
          >
            Entrar →
          </button>

          <p style={{ fontSize: 11, color: "#aaa", marginTop: 20, lineHeight: 1.5 }}>
            Demo local — as respostas são simuladas por IA
          </p>
        </div>
      </div>
    );
  }

  // CHAT APP
  const contact = activeChat ? contacts.find(c => c.id === activeChat.id) : null;
  const chatMsgs = activeChat ? (messages[activeChat.id] || []) : [];

  return (
    <div style={{
      display: "flex", height: 620, fontFamily: "'Segoe UI', sans-serif",
      borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)"
    }}>
      {/* SIDEBAR */}
      <div style={{
        width: 320, background: "#fff", borderRight: "1px solid #f0f0f0",
        display: "flex", flexDirection: "column", flexShrink: 0
      }}>
        {/* Header */}
        <div style={{
          background: "#075E54", padding: "14px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={myName || phone} color="#25D366" size={36} />
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 16 }}>
              {myName || "Eu"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={() => setShowNew(!showNew)} style={{
              background: "none", border: "none", cursor: "pointer", padding: 4,
              borderRadius: 50, display: "flex", alignItems: "center"
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Add contact panel */}
        {showNew && (
          <div style={{ background: "#e8f5e9", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#075E54", margin: "0 0 8px" }}>NOVO CONTATO</p>
            <input placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 6, fontSize: 13, boxSizing: "border-box" }} />
            <input placeholder="Número" value={newPhone} onChange={e => setNewPhone(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", marginBottom: 8, fontSize: 13, boxSizing: "border-box" }} />
            <button onClick={addContact} style={{
              background: "#25D366", color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%"
            }}>Adicionar</button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "8px 12px", background: "#f6f6f6" }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8, border: "1px solid #e8e8e8"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#aaa" strokeWidth="2"/>
              <path d="M16.5 16.5L21 21" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              placeholder="Pesquisar ou começar nova conversa"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: "none", outline: "none", width: "100%", fontSize: 13, background: "none", color: "#333" }}
            />
          </div>
        </div>

        {/* Contact list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredContacts.map(c => (
            <div key={c.id} onClick={() => openChat(c)} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px", cursor: "pointer",
              background: activeChat?.id === c.id ? "#f0f0f0" : "transparent",
              borderBottom: "1px solid #f5f5f5", transition: "background .15s"
            }}
              onMouseEnter={e => { if (activeChat?.id !== c.id) e.currentTarget.style.background = "#f9f9f9" }}
              onMouseLeave={e => { if (activeChat?.id !== c.id) e.currentTarget.style.background = "transparent" }}
            >
              <Avatar name={c.name} color={c.color} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "#111" }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: c.unread > 0 ? "#25D366" : "#aaa" }}>{c.time}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>
                    {c.lastMsg}
                  </span>
                  {c.unread > 0 && (
                    <span style={{
                      background: "#25D366", color: "#fff", borderRadius: 10,
                      padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0
                    }}>{c.unread}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      {!activeChat ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#f0f2f5", gap: 16
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "#25D366", display: "flex", alignItems: "center",
            justifyContent: "center", opacity: 0.3
          }}>
            <svg width="56" height="56" viewBox="0 0 44 44" fill="none">
              <path d="M22 4C12.06 4 4 12.06 4 22c0 3.18.84 6.16 2.3 8.74L4 40l9.5-2.28A17.93 17.93 0 0022 40c9.94 0 18-8.06 18-18S31.94 4 22 4z" fill="#fff"/>
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#667781", fontSize: 20, fontWeight: 300, margin: "0 0 8px" }}>WhatZapp Web</p>
            <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>Selecione uma conversa para começar</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#efeae2" }}>
          {/* Chat header */}
          <div style={{
            background: "#075E54", padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 12
          }}>
            <button onClick={() => setActiveChat(null)} style={{
              background: "none", border: "none", cursor: "pointer", padding: 4,
              display: "flex", alignItems: "center"
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <Avatar name={contact?.name || ""} color={contact?.color || "#25D366"} size={38} />
            <div>
              <p style={{ color: "#fff", fontWeight: 600, fontSize: 15, margin: 0 }}>{contact?.name}</p>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, margin: 0 }}>
                {typing ? "digitando..." : contact?.phone}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: 4,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}>
            {chatMsgs.map(msg => (
              <div key={msg.id} style={{
                display: "flex",
                justifyContent: msg.from === "me" ? "flex-end" : "flex-start",
                marginBottom: 2
              }}>
                <div style={{
                  maxWidth: "65%", padding: "8px 12px 4px",
                  borderRadius: msg.from === "me" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: msg.from === "me" ? "#dcf8c6" : "#fff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
                }}>
                  <p style={{ margin: 0, fontSize: 14, color: "#111", lineHeight: 1.5, wordBreak: "break-word" }}>
                    {msg.text}
                  </p>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: "#999" }}>{msg.time}</span>
                    {msg.from === "me" && (
                      <svg width="14" height="10" viewBox="0 0 16 11" fill="none">
                        <path d="M1 5.5L5 9.5L11 1.5M7 9.5L15 1.5" stroke="#4FC3F7" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  background: "#fff", borderRadius: "12px 12px 12px 2px",
                  padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  display: "flex", gap: 4, alignItems: "center"
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: "50%", background: "#aaa",
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            background: "#f0f2f5", padding: "8px 12px",
            display: "flex", alignItems: "center", gap: 8
          }}>
            <div style={{
              flex: 1, background: "#fff", borderRadius: 24,
              display: "flex", alignItems: "center", padding: "0 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Digite uma mensagem"
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 15,
                  padding: "12px 0", background: "none", fontFamily: "inherit", color: "#111"
                }}
              />
            </div>
            <button onClick={sendMessage} disabled={!input.trim()} style={{
              width: 46, height: 46, borderRadius: "50%",
              background: input.trim() ? "#25D366" : "#aaa",
              border: "none", cursor: input.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background .2s", flexShrink: 0
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 2
