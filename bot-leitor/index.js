/* ═══════════════════════════════════════════════════════════════════════
   Secretária Leitora — conexão com o WhatsApp.
   ───────────────────────────────────────────────────────────────────────
   O que ela faz:  escuta os grupos configurados, passa cada mensagem pelo
                   cérebro (engine.js) e grava as OFERTAS de imóveis no
                   HomeMatch (Firebase). NUNCA envia mensagem a ninguém.
   O que ela NÃO faz:  responder, abordar corretor, qualquer escrita no grupo.
                   (Isso é trabalho da futura "Embaixadora", em outro número.)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const { criarPipeline, criarFirebaseStore } = require('./ingest');

// ─── Config via variáveis de ambiente (.env carregado pelo runtime/pm2) ───
const CONFIG = {
  uid:           process.env.HM_UID,                              // UID do usuário HomeMatch (destino dos imóveis)
  serviceAccount:process.env.HM_FIREBASE_SA || './service-account.json',
  databaseURL:   process.env.HM_DB_URL || 'https://homematch-crm-default-rtdb.firebaseio.com',
  gruposJid:    (process.env.HM_GRUPOS_JID || '').split(',').map(s=>s.trim()).filter(Boolean),
  grupoNomeInclui:(process.env.HM_GRUPO_NOME || '').toLowerCase(),  // alternativa: casar pelo nome do grupo
  minConfianca:  parseInt(process.env.HM_MIN_CONFIANCA || '60', 10),
  authDir:       process.env.HM_AUTH_DIR || './auth',
};

// Log simples no console (a pipeline usa log.info). Sem dependências extras.
const safeLog = console;

// ─── Firebase Admin ───
function initFirebase() {
  if (!CONFIG.uid) { console.error('✗ Defina HM_UID (UID do seu usuário no HomeMatch). Veja o README.'); process.exit(1); }
  let sa;
  try { sa = require(path.resolve(CONFIG.serviceAccount)); }
  catch { console.error(`✗ service-account.json não encontrado em ${CONFIG.serviceAccount}. Baixe no Firebase Console > Configurações > Contas de serviço.`); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: CONFIG.databaseURL });
  return admin.database().ref(`users/${CONFIG.uid}/imoveis`);
}

// ─── Extrai texto de qualquer tipo de mensagem ───
function extrairTexto(msg) {
  const m = msg.message || {};
  return (m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || '').trim();
}

async function main() {
  const imoveisRef = initFirebase();
  const store = criarFirebaseStore(imoveisRef);
  const pipe = criarPipeline({ store, minConfianca: CONFIG.minConfianca, log: safeLog });

  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level:'silent' }) });

  const gruposNome = new Map(); // jid -> subject (cache)
  const grupoPermitido = (jid, subject) => {
    if (CONFIG.gruposJid.length) return CONFIG.gruposJid.includes(jid);
    if (CONFIG.grupoNomeInclui) return (subject||'').toLowerCase().includes(CONFIG.grupoNomeInclui);
    return true; // sem filtro: escuta todos os grupos em que o número está
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { console.log('\n📱 Escaneie o QR abaixo com o WhatsApp do número DEDICADO da Leitora:\n'); qrcode.generate(qr, { small:true }); }
    if (connection === 'open') {
      console.log('✓ Leitora conectada. Ouvindo o grupo (modo passivo, só leitura).');
      try {
        const grupos = await sock.groupFetchAllParticipating();
        Object.values(grupos).forEach(g => gruposNome.set(g.id, g.subject));
        console.log(`\nGrupos visíveis (${gruposNome.size}). Para travar em um só, coloque o JID em HM_GRUPOS_JID:`);
        gruposNome.forEach((nome, jid) => console.log(`   ${grupoPermitido(jid, nome)?'•':' '} ${nome}  →  ${jid}`));
        console.log('');
      } catch (e) { console.warn('Não consegui listar grupos:', e.message); }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconectar = code !== DisconnectReason.loggedOut;
      console.warn(`Conexão caiu (${code||'?'}).`, reconectar ? 'Reconectando…' : 'Deslogado — apague a pasta auth e escaneie de novo.');
      if (reconectar) setTimeout(main, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      if (!jid.endsWith('@g.us')) continue;        // só grupos
      if (msg.key.fromMe) continue;                // ignora as próprias
      const subject = gruposNome.get(jid);
      if (!grupoPermitido(jid, subject)) continue; // fora do grupo alvo

      const texto = extrairTexto(msg);
      if (texto.length < 8) continue;              // muito curto pra ser oferta

      try {
        await pipe.processar(texto, { autor: msg.key.participant || jid, grupo: subject || jid });
      } catch (e) { console.error('Erro ao processar mensagem:', e.message); }
    }
  });

  // Resumo periódico (a cada 10 min)
  setInterval(() => {
    const s = pipe.stats;
    console.log(`📊 recebidas ${s.recebidas} · ofertas ${s.ofertas} · gravadas ${s.gravadas} · duplicadas ${s.duplicadas} · ruído ${s.baixaConf+s.naoOferta}`);
  }, 10 * 60 * 1000);
}

main().catch(e => { console.error('Falha fatal:', e); process.exit(1); });
