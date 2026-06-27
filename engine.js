/* ═══════════════════════════════════════════════════════════════════════
   HomeMatch · Engine de extração (cérebro compartilhado)
   ───────────────────────────────────────────────────────────────────────
   Um único motor de leitura usado por TODAS as "secretárias":
     • extrator.html  (interface manual, no navegador)
     • bot-leitor     (Secretária Leitora automática, no Node)
   Mantê-lo aqui evita que cada lugar leia de um jeito e dê erro diferente.
   UMD: roda como <script> no navegador (window.HMEngine) e via require() no Node.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HMEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── DADOS DO DOMÍNIO (espelham o HomeMatch) ───
  const BAIRROS = ['Adrianópolis','Aleixo','Alvorada','Armando Mendes','Betânia','Cachoeirinha','Centro','Chapada','Cidade Nova','Colônia Oliveira Machado','Compensa','Coroado','Crespo','Da Paz','Dom Pedro','Educandos','Flores','Gilberto Mestrinho','Glória','Japiim','Jesus de Nazaré','Jorge Teixeira','Lago Azul','Lírio do Vale','Mauazinho','Monte das Oliveiras','Morro da Liberdade','Nossa Senhora Aparecida','Nossa Senhora das Graças','Nova Cidade','Nova Esperança','Novo Aleixo','Novo Israel','Parque 10 de Novembro','Petrópolis','Planalto','Ponta Negra','Praça 14 de Janeiro','Presidente Vargas','Raiz','Redenção','Santo Antônio','São Francisco','São Jorge','São Lázaro','São Raimundo','Tancredo Neves','Terra Nova','Tarumã','Vieiralves','Vila Buriti','Vila da Prata','Zumbi dos Palmares'].sort();
  const BAIRRO_ALIAS = { 'parque 10':'Parque 10 de Novembro','pq 10':'Parque 10 de Novembro','pn':'Ponta Negra','gracas':'Nossa Senhora das Graças','aparecida':'Nossa Senhora Aparecida' };
  const TIPOS_CAT = {
    condominio:['Apartamento','Casa de Condomínio','Cobertura','Flat','Lote em Condomínio'],
    via_publica:['Casa','Apartamento em Via Pública','Lote'],
    comercial:['Loja/Ponto','Sala/Andar','Prédio','Galpão/Depósito','Hotel/Motel/Pousada','Posto de Gasolina','Hangar','Marina'],
    rural:['Chácara/Sítio/Fazenda Residencial','Chácara/Sítio/Fazenda Comercial','Lote Rural'],
  };
  const ALL_TIPOS = Object.values(TIPOS_CAT).flat();
  const CAT_LABEL = { condominio:'Condomínio', via_publica:'Via Pública', comercial:'Comercial', rural:'Rural' };

  // ─── HELPERS ───
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }
  function today(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function gerarCodigo(tipo,bairro,usados){
    const t=tipo?tipo.replace(/[^A-Za-zÀ-ÿ]/g,'').substring(0,2).toUpperCase():'IM';
    const b=bairro?bairro.replace(/[^A-Za-zÀ-ÿ]/g,'').substring(0,3).toUpperCase():'MNS';
    let c,a=0; do{ c=`${t}${b}${String(Date.now()+a).slice(-5)}`; a++; }while(usados.has(c)); usados.add(c); return c;
  }

  // ─── MOTOR HEURÍSTICO ───
  function parseValor(txt){
    const t = norm(txt).replace(/\s+/g,' ');
    let m;
    m = t.match(/r?\$?\s*(\d+(?:[.,]\d+)?)\s*(?:milhoes|milhao|milh|mi(?![l\w]))/);
    if(m) return Math.round(parseFloat(m[1].replace(',','.'))*1e6);
    m = t.match(/r?\$?\s*(\d+(?:[.,]\d+)?)\s*mil(?!h)\b/);
    if(m) return Math.round(parseFloat(m[1].replace(',','.'))*1e3);
    m = t.match(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d{4,})(?:,\d{2})?/);
    if(m) return parseInt(m[1].replace(/\./g,''),10)||0;
    m = t.match(/(?<![\d(])\b(\d{1,3}(?:\.\d{3})+)\b(?!\s*m[²2])/);
    if(m) return parseInt(m[1].replace(/\./g,''),10)||0;
    return 0;
  }
  function parsePhone(txt){
    const m = txt.match(/(?:\+?55\s*)?\(?\b(?:92|11|21|9\d)\)?\s*9?\d{4}[-.\s]?\d{4}\b/);
    return m ? m[0].trim() : '';
  }
  function parseHeuristico(txt){
    const t = norm(txt);
    const procura = /(procuro|busco|preciso|necessito|estou procurando|to procurando|cliente (quer|busca|procura|precisa)|quem tem|alguem tem|algum corretor tem)/.test(t);
    const oferta  = /(vendo|alugo|aluga-se|vende-se|disponivel|repasse|lancamento|oportunidade|a venda|para alugar|tenho (um|uma|a |para))/.test(t);
    const kind = procura && !oferta ? 'procura' : 'oferta';

    const finalidade = [];
    if(/(alug|locac|locar|\/mes|mensal)/.test(t)) finalidade.push('aluguel');
    if(/(vend|a venda|repasse|financ)/.test(t)) finalidade.push('venda');
    if(/(temporad|diaria|airbnb)/.test(t)) finalidade.push('temporada');

    let cat='', tipo='';
    if(/\bcobertura\b/.test(t)){cat='condominio';tipo='Cobertura';}
    else if(/\bflat\b/.test(t)){cat='condominio';tipo='Flat';}
    else if(/casa (de|em) cond/.test(t)){cat='condominio';tipo='Casa de Condomínio';}
    else if(/\b(apartamento|apto|aptos|apt|ap)\b/.test(t)){cat='condominio';tipo='Apartamento';}
    else if(/\bcasa\b/.test(t)){cat='via_publica';tipo='Casa';}
    else if(/\b(loja|ponto|sala|galpao|deposito|predio comercial)\b/.test(t)){cat='comercial';tipo='Loja/Ponto';}
    else if(/\b(terreno|lote)\b/.test(t)){cat='via_publica';tipo='Lote';}
    else if(/\b(chacara|sitio|fazenda)\b/.test(t)){cat='rural';tipo='Chácara/Sítio/Fazenda Residencial';}

    let bairro='';
    for(const [ali,canon] of Object.entries(BAIRRO_ALIAS)){ if(new RegExp(`\\b${ali}\\b`).test(t)){ bairro=canon; break; } }
    if(!bairro) for(const b of BAIRROS){ if(t.includes(norm(b))){ bairro=b; break; } }

    const q = t.match(/(\d+)\s*(?:quartos?|qts?|dorm(?:itorios?)?)/) || t.match(/(\d)\s*\/\s*4/);
    const s = t.match(/(\d+)\s*su[ií]?tes?/);
    const g = t.match(/(\d+)\s*(?:vagas?|garagens?)/);
    const a = t.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/);
    let mobilia='';
    if(/semi[\s-]?mob/.test(t)) mobilia='semi';
    else if(/\bmobiliad/.test(t)) mobilia='sim';
    else if(/sem mobili|vazio|nao mobiliad/.test(t)) mobilia='nao';

    const valorNum = parseValor(txt);
    const soVenda = finalidade.includes('venda') && !finalidade.includes('aluguel');
    return {
      kind, finalidade, cat, tipo, bairro,
      quartos:q?parseInt(q[1]):0, suites:s?parseInt(s[1]):0,
      garagem:g?parseInt(g[1]):0, area:a?parseFloat(a[1].replace(',','.')):0,
      mobilia, telefone:parsePhone(txt),
      valor: soVenda?0:valorNum, valor_venda: finalidade.includes('venda')?valorNum:0,
      raw: txt.trim(),
    };
  }

  // ─── AVALIAÇÃO (confiança / pendências) ───
  function avaliar(it){
    const pend=[];
    if(!it.tipo) pend.push('tipo');
    if(!it.bairro) pend.push('bairro');
    if(!it.finalidade.length) pend.push('finalidade');
    if(!it.valor && !it.valor_venda) pend.push('valor');
    it.pendencias = pend;
    it.confianca = Math.max(20, 100 - pend.length*20);
    if(it.dropped===undefined) it.dropped = false;
    if(!it._id) it._id = uid();
    return it;
  }

  // ─── CONVERSORES → schema do HomeMatch ───
  function toImovel(it,usados){
    const finalidade = it.finalidade.length?it.finalidade:(it.valor_venda?['venda']:['aluguel']);
    const im = {
      id:uid(), codigo:gerarCodigo(it.tipo,it.bairro,usados),
      cat:it.cat||'condominio', tipo:it.tipo||'', bairro:it.bairro||'', finalidade,
      cond:'', status:'disponivel', prop_id:'', updated:today(),
      quartos:it.quartos, suites:it.suites, garagem:it.garagem, area:it.area,
      mobilia:it.mobilia, mobilia_obs:'', fotos:[], administrado:false,
      contrato_fim:null, contrato_inicio:null, dia_venc:null, indisp_obs:null,
      obs:`[Importado do grupo via Extrator]${it.telefone?` Contato corretor: ${it.telefone}.`:''}\n"${it.raw}"`,
      origem: it.origem || 'extrator',
    };
    if(finalidade.includes('aluguel')){ im.valor=it.valor||0; im.comissao_alug=6; }
    if(finalidade.includes('venda')){ im.valor_venda=it.valor_venda||0; im.comissao_venda=6; im.aceita_fin=''; }
    return im;
  }
  function toCliente(it){
    const intent = it.finalidade.includes('venda')&&!it.finalidade.includes('aluguel')?'compra'
                 : it.finalidade.includes('aluguel')?'aluguel':'ambos';
    return {
      id:uid(),
      nome: it.telefone?`Corretor ${it.telefone}`:'Procura (grupo)',
      tel: it.telefone||'', alerta:'ativo', intent,
      perfil_txt:`[Importado via Extrator] "${it.raw}"`,
      perfil:{ cat:it.cat||'', tipo:it.tipo||'', bairro:it.bairro||'', mobilia:it.mobilia||'',
               qmin:it.quartos||0, smin:it.suites||0, vmin:0, vmax:it.valor_venda||it.valor||0 },
      created:new Date().toISOString(), historico:[], origem: it.origem || 'extrator',
    };
  }

  // ─── Inferência de finalidade por magnitude (para uso AUTOMÁTICO, sem humano) ───
  // Aluguel em Manaus é mensal (centenas a poucos milhares); venda é dezenas de
  // milhares pra cima. Quando a mensagem não diz a finalidade, deduz pelo valor.
  // No Extrator manual isto NÃO é chamado — lá quem decide é a pessoa.
  function inferirFinalidade(it){
    if(it.finalidade && it.finalidade.length) return it;
    const v = it.valor || it.valor_venda || 0;
    if(!v) return it;
    if(v >= 20000){ it.finalidade=['venda'];   it.valor_venda=v; it.valor=0; }
    else          { it.finalidade=['aluguel']; it.valor=v;       it.valor_venda=0; }
    return it;
  }

  // ─── Assinatura de deduplicação (mesma oferta repetida no grupo) ───
  function assinatura(it){
    return [it.kind, it.tipo, it.bairro, it.quartos, it.valor||it.valor_venda, (it.telefone||'').replace(/\D/g,'')]
      .join('|').toLowerCase();
  }

  return {
    BAIRROS, BAIRRO_ALIAS, TIPOS_CAT, ALL_TIPOS, CAT_LABEL,
    norm, uid, today, gerarCodigo,
    parseValor, parsePhone, parseHeuristico, avaliar, inferirFinalidade,
    toImovel, toCliente, assinatura,
  };
}));
