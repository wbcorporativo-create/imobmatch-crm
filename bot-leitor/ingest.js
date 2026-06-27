/* ═══════════════════════════════════════════════════════════════════════
   Ingestão — o que a Secretária Leitora faz com cada mensagem do grupo.
   Independente do WhatsApp (recebe só texto) e do Firebase (recebe um
   "store"), para poder ser testada isoladamente (test/feed.js).
   ═══════════════════════════════════════════════════════════════════════ */
const Engine = require('../engine.js');

// Analisa um texto cru. Retorna a decisão SEM gravar nada.
// A Leitora, por enquanto, SÓ aceita ofertas (encher o banco de imóveis).
function analisar(texto, minConfianca = 60) {
  let it = Engine.parseHeuristico(texto || '');
  it = Engine.inferirFinalidade(it);   // automação: resolve finalidade ambígua pela magnitude
  it = Engine.avaliar(it);
  if (it.kind !== 'oferta') return { aceito:false, motivo:'nao_e_oferta', item:it };
  if (it.confianca < minConfianca) return { aceito:false, motivo:'baixa_confianca', item:it };
  return { aceito:true, item:it };
}

// Pipeline com estado: dedup em memória (rápido) + persistência via store.
function criarPipeline({ store, minConfianca = 60, log = console }) {
  const vistosSessao = new Set();
  const stats = { recebidas:0, ofertas:0, gravadas:0, duplicadas:0, baixaConf:0, naoOferta:0 };

  async function processar(texto, meta = {}) {
    stats.recebidas++;
    const r = analisar(texto, minConfianca);
    if (!r.aceito) {
      if (r.motivo === 'nao_e_oferta') stats.naoOferta++;
      else if (r.motivo === 'baixa_confianca') stats.baixaConf++;
      return r;
    }
    stats.ofertas++;
    const it = r.item;
    it.origem = 'leitora';
    if (meta.autor) it.autor = meta.autor;

    const sig = Engine.assinatura(it);
    if (vistosSessao.has(sig)) { stats.duplicadas++; return { aceito:false, motivo:'duplicado_sessao', item:it }; }

    const res = await store.salvar(it, sig);
    if (res.novo) {
      vistosSessao.add(sig);
      stats.gravadas++;
      log.info?.(`✓ oferta gravada [${it.confianca}%] ${it.tipo||'?'} · ${it.bairro||'?'} · ${(it.valor||it.valor_venda)?'R$ '+(it.valor||it.valor_venda).toLocaleString('pt-BR'):'s/ valor'}`);
      return { aceito:true, item:it };
    }
    stats.duplicadas++;
    return { aceito:false, motivo:'duplicado_banco', item:it };
  }

  return { processar, stats };
}

// Store em Firebase (Realtime DB) via Admin SDK. Append com dedup, em transação,
// no MESMO caminho que o app HomeMatch lê: users/{uid}/imoveis
function criarFirebaseStore(imoveisRef) {
  return {
    async salvar(it, sig) {
      let novo = false;
      await imoveisRef.transaction(arr => {
        arr = arr || [];
        if (arr.some(x => x && x._sig === sig)) { novo = false; return; } // aborta: já existe
        const usados = new Set(arr.map(x => x && x.codigo).filter(Boolean));
        const im = Engine.toImovel(it, usados);
        im._sig = sig;
        arr.push(im);
        novo = true;
        return arr;
      });
      return { novo };
    }
  };
}

// Store em memória — usado nos testes (dry-run), sem Firebase.
function criarMemStore(seed = []) {
  const imoveis = [...seed];
  return {
    imoveis,
    async salvar(it, sig) {
      if (imoveis.some(x => x._sig === sig)) return { novo:false };
      const usados = new Set(imoveis.map(x => x.codigo).filter(Boolean));
      const im = Engine.toImovel(it, usados);
      im._sig = sig;
      imoveis.push(im);
      return { novo:true };
    }
  };
}

module.exports = { analisar, criarPipeline, criarFirebaseStore, criarMemStore };
