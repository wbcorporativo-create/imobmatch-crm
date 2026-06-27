/* Dry-run: simula um fluxo de mensagens de grupo passando pela Secretária
   Leitora, usando store em memória. Roda sem WhatsApp e sem Firebase.
   Uso: node test/feed.js                                                   */
const { criarPipeline, criarMemStore } = require('../ingest');

// Amostra propositalmente "suja", como um grupo real: ofertas, procuras,
// conversa fiada, duplicata e oferta sem valor.
const MENSAGENS = [
  'Bom dia grupo!',                                                                  // ruído
  'Vendo ap 3 quartos sendo 1 suíte no Aleixo, 2 vagas, 92m², R$ 450 mil. Zap 92 99155-2030', // oferta
  'Procuro casa pra alugar no Parque 10, cliente quer 3/4, até R$ 3.500/mês',        // procura (ignorar)
  'Repasse cobertura mobiliada na Ponta Negra, 1,2 milhão, 3 suítes',               // oferta
  'alguém sabe o telefone do cartório?',                                            // ruído
  'Vendo ap 3 qts 1 suite no Aleixo, 2 vagas, 92m2, 450 mil, falar 92 99155-2030',  // DUPLICATA da 2ª
  'Alugo casa no Tarumã, 4 quartos, mobiliada',                                      // oferta SEM valor (baixa conf?)
  'Sítio no Tarumã, 2000m², R$ 800.000, ótimo pra lazer',                           // oferta s/ finalidade explícita
];

(async () => {
  const store = criarMemStore();
  const log = { info: (...a) => console.log('  ', ...a) };
  const pipe = criarPipeline({ store, minConfianca: 40, log });

  console.log('=== Processando', MENSAGENS.length, 'mensagens ===\n');
  for (const msg of MENSAGENS) {
    const r = await pipe.processar(msg, { autor: '55929xxxx@s.whatsapp.net' });
    const tag = r.aceito ? 'GRAVADA ' : 'ignorada';
    console.log(`[${tag}] ${r.aceito ? '' : '('+r.motivo+') '}«${msg.slice(0,55)}${msg.length>55?'…':''}»`);
  }

  console.log('\n=== Resumo ===');
  console.log(JSON.stringify(pipe.stats, null, 1));
  console.log('\n=== Banco final (', store.imoveis.length, 'imóveis ) ===');
  store.imoveis.forEach(im => console.log(`  ${im.codigo} · ${im.tipo} · ${im.bairro} · ${im.finalidade.join('+')} · R$ ${(im.valor||im.valor_venda||0).toLocaleString('pt-BR')}`));

  // Asserções
  const sitio = store.imoveis.find(im => im.tipo.startsWith('Chácara'));
  const checks = {
    'gravou 4 imóveis':            store.imoveis.length === 4,
    'pegou 1 duplicata':           pipe.stats.duplicadas === 1,
    'ignorou a procura':           pipe.stats.naoOferta === 1,
    'filtrou 2 ruídos':            pipe.stats.baixaConf === 2,
    'sítio inferido como venda':   !!sitio && sitio.finalidade.includes('venda') && sitio.valor_venda === 800000,
  };
  console.log('');
  let ok = true;
  for (const [nome, passou] of Object.entries(checks)) { console.log(`  ${passou?'✓':'✗'} ${nome}`); ok = ok && passou; }
  console.log('\n' + (ok ? '✓ PASSOU' : '✗ FALHOU'));
  process.exit(ok ? 0 : 1);
})();
