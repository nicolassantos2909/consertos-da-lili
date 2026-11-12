/* =========================================================
   Consertos da Lili — app.js
   ---------------------------------------------------------
   Lógica das telas. Todo acesso a dados passa pelo db.js.

   Organização deste arquivo:
     1. Estado (dados em memória)
     2. Utilitários (dinheiro, datas, WhatsApp, cópia)
     3. Avisos, painéis e perguntas
     4. Início, login e navegação
     5. Aba "Novo pedido"
     6. Mensagem para a cliente
     7. Aba "Pedidos" + detalhes do pedido
     8. Aba "Clientes"
     9. Aba "Resumo"
    10. Configurações (Pix e serviços)
    11. Ligação dos cliques e digitação
   ========================================================= */

import * as db from './db.js';

/* =========================================================
   1. ESTADO
   ========================================================= */
const estado = {
  usuario: '',
  servicos: [],
  clientes: [],
  pedidos: [],
  config: { ...db.CONFIG_PADRAO },
  aba: 'pedidos',             // novo | pedidos | clientes | resumo | config
  abaAnterior: 'pedidos',     // para o botão "voltar" das Configurações
  filtroPedidos: 'costura',   // costura | receber | concluidos
  buscaPedidos: '',
  buscaClientes: '',
  mesResumo: inicioDoMes(new Date()),
  form: null,                 // rascunho do "Novo pedido" (não se perde ao trocar de aba)
  ultimoSalvo: null,          // { pedido, mensagem, copiou } — tela de sucesso
  atualizarFolha: null,       // função que redesenha o painel aberto
};

const TITULOS = {
  novo: 'Novo pedido', pedidos: 'Pedidos', clientes: 'Clientes', resumo: 'Resumo', config: 'Configurações',
};
const FORMAS_PAGAMENTO = [
  { nome: 'Pix', icone: '📲' },
  { nome: 'Dinheiro', icone: '💵' },
  { nome: 'Cartão', icone: '💳' },
];

/* =========================================================
   2. UTILITÁRIOS
   ========================================================= */
const $ = (seletor, el = document) => el.querySelector(seletor);
const $$ = (seletor, el = document) => [...el.querySelectorAll(seletor)];

/** Protege textos digitados antes de colocar no HTML */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** "Mária " → "maria" (para buscas sem acento) */
function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* ---------- Dinheiro ---------- */
/** 15 → "R$ 15,00" */
function moeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
/** Igual a moeda(), mas com espaço comum (para a mensagem do WhatsApp) */
const moedaTexto = (valor) => moeda(valor).replace(/\s/g, ' ');
/** "15,50" ou "R$ 15,50" → 15.5 */
function lerValor(texto) {
  let s = String(texto ?? '').replace(/[^\d,.]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
/** 15 → "15,00" (para mostrar dentro de um campo) */
const valorCampo = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
const somaTotais = (pedidos) => Math.round(pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100;

/* ---------- Datas ---------- */
function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function inicioDoMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function mesmoMes(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
/** Date → "2026-11-12" (formato dos campos de data) */
function isoDeData(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
/** "2026-11-12" → Date (meio-dia, para não “pular” de dia por fuso horário) */
function dataDeIso(texto) {
  if (!texto) return null;
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0);
}
const dataBR = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const dataCurta = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const diasEntre = (a, b) => Math.round((inicioDoDia(b) - inicioDoDia(a)) / 86400000);
function nomeDoMes(d) {
  const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- WhatsApp ---------- */
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
/** "11987654321" → "(11) 98765-4321" */
function formatarWhats(valor) {
  let d = soDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
/** Link https://wa.me/55NUMERO?text=MENSAGEM (sem número: ela escolhe o contato) */
function linkWhats(numero, texto = '') {
  let d = soDigitos(numero);
  if (d && d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}

/* ---------- Copiar texto ---------- */
/** Tenta copiar. Devolve true se deu certo. */
async function copiarTexto(texto) {
  // Jeito moderno
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* tenta o jeito antigo abaixo */ }
  // Jeito antigo (funciona em navegadores mais velhos)
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
/** Copia e avisa. Se não der, mostra o texto para ela copiar com o dedo. */
async function copiarComAviso(texto) {
  if (await copiarTexto(texto)) {
    toast('Mensagem copiada! ✅');
    return;
  }
  await abrirDialogo(`
    <h2>Copie a mensagem</h2>
    <p>Toque e segure no texto abaixo e escolha <strong>Copiar</strong>.</p>
    <textarea class="mensagem-manual" readonly rows="10">${esc(texto)}</textarea>
    <div class="botoes-col"><button type="button" class="btn btn-teal" data-resposta="ok">Pronto</button></div>`);
}

/* ---------- Pedidos ---------- */
const acharPedido = (id) => estado.pedidos.find((p) => p.id === id);
/** Em qual aba o pedido aparece */
function categoria(p) {
  if (!p.entregue) return 'costura';
  if (!p.pago) return 'receber';
  return 'concluidos';
}
const resumoItens = (p) => (p.itens || []).map((i) => `${i.qtd}x ${i.nome}`).join(', ');
const ordenarPorNome = (lista, campo = 'nome') =>
  lista.sort((a, b) => String(a[campo]).localeCompare(String(b[campo]), 'pt-BR'));
const servicosAtivos = () => estado.servicos.filter((s) => s.ativo !== false);

/* =========================================================
   3. AVISOS, PAINÉIS E PERGUNTAS
   ========================================================= */

/* ---------- Aviso rápido no rodapé ---------- */
let temporizadorToast;
function toast(mensagem, opcoes = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(mensagem)}</span>` +
    (opcoes.acao ? `<button type="button" class="toast-btn">${esc(opcoes.rotulo || 'Desfazer')}</button>` : '');
  el.hidden = false;
  if (opcoes.acao) {
    $('.toast-btn', el).onclick = () => { el.hidden = true; opcoes.acao(); };
  }
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.hidden = true; }, opcoes.acao ? 8000 : 3500);
}

/* ---------- Painel que sobe de baixo ("folha") ---------- */
function abrirFolha(html, atualizar = null) {
  const fundo = $('#folha');
  const jaAberta = !fundo.hidden;
  fundo.innerHTML = `
    <div class="folha-painel" role="dialog" aria-modal="true">
      <button type="button" class="folha-fechar" data-acao="fechar-folha" aria-label="Fechar">✕</button>
      <div class="folha-conteudo">${html}</div>
    </div>`;
  fundo.hidden = false;
  document.body.classList.add('travado');
  estado.atualizarFolha = atualizar;
  // Botão "voltar" do celular fecha o painel em vez de sair do app
  if (!jaAberta) history.pushState({ folha: true }, '');
}
function trocarConteudoFolha(html) {
  const c = $('#folha .folha-conteudo');
  if (c) c.innerHTML = html;
}
function esconderFolha() {
  const fundo = $('#folha');
  fundo.hidden = true;
  fundo.innerHTML = '';
  document.body.classList.remove('travado');
  estado.atualizarFolha = null;
}
function fecharFolha() {
  if ($('#folha').hidden) return;
  if (history.state && history.state.folha) history.back(); // o "popstate" esconde
  else esconderFolha();
}
window.addEventListener('popstate', esconderFolha);

/* ---------- Caixa de pergunta (no meio da tela) ---------- */
/** Mostra o HTML e devolve o data-resposta do botão tocado (ou null) */
function abrirDialogo(html) {
  return new Promise((resolver) => {
    const fundo = $('#dialogo');
    fundo.innerHTML = `<div class="dialogo-caixa" role="alertdialog" aria-modal="true">${html}</div>`;
    fundo.hidden = false;
    const fechar = (resposta) => {
      fundo.hidden = true;
      fundo.innerHTML = '';
      fundo.onclick = null;
      resolver(resposta);
    };
    fundo.onclick = (e) => {
      const botao = e.target.closest('[data-resposta]');
      if (botao) fechar(botao.dataset.resposta);
      else if (e.target === fundo) fechar(null);
    };
    const primeiro = $('[data-resposta]', fundo);
    if (primeiro) primeiro.focus();
  });
}
/** Pergunta Sim/Não. Devolve true se ela confirmou. */
async function perguntar({ titulo, texto = '', sim = 'Sim', nao = 'Cancelar', perigo = false }) {
  const r = await abrirDialogo(`
    <h2>${esc(titulo)}</h2>
    ${texto ? `<p>${texto}</p>` : ''}
    <div class="botoes-col">
      <button type="button" class="btn ${perigo ? 'btn-perigo-cheio' : 'btn-rosa'}" data-resposta="sim">${esc(sim)}</button>
      <button type="button" class="btn btn-leve" data-resposta="nao">${esc(nao)}</button>
    </div>`);
  return r === 'sim';
}
/** Pergunta como a cliente pagou. Devolve "Pix", "Dinheiro", "Cartão" ou null. */
async function escolherPagamento(atual) {
  const r = await abrirDialogo(`
    <h2>Como a cliente pagou?</h2>
    <div class="botoes-col">
      ${FORMAS_PAGAMENTO.map((f) => `
        <button type="button" class="btn ${f.nome === atual ? 'btn-teal' : 'btn-contorno'} btn-grande" data-resposta="${f.nome}">
          ${f.icone} ${f.nome}
        </button>`).join('')}
      <button type="button" class="btn btn-leve" data-resposta="">Cancelar</button>
    </div>`);
  return r || null;
}

/* =========================================================
   4. INÍCIO, LOGIN E NAVEGAÇÃO
   ========================================================= */
function mostrarTela(id) {
  $$('.tela').forEach((t) => { t.hidden = t.id !== id; });
  window.scrollTo(0, 0);
}

async function iniciar() {
  registrarServiceWorker();
  if (db.MODO_DEMO) $('#aviso-demo').hidden = false;

  try {
    await db.iniciar();
  } catch (erro) {
    console.error(erro);
    $('#carregando-texto').textContent = 'Não consegui abrir o app. Verifique a internet e toque aqui para tentar de novo.';
    $('#tela-carregando').onclick = () => location.reload();
    return;
  }

  db.observarLogin(async (usuario) => {
    if (usuario) {
      estado.usuario = usuario.usuario;
      await abrirApp();
    } else {
      estado.usuario = '';
      estado.form = null;
      estado.ultimoSalvo = null;
      mostrarTela('tela-inicio');
    }
  });
}

async function abrirApp() {
  $('#carregando-texto').textContent = 'Carregando seus pedidos…';
  mostrarTela('tela-carregando');
  try {
    await carregarTudo();
  } catch (erro) {
    console.error(erro);
    toast('Não consegui carregar os dados. Verifique a internet.');
  }
  if (!estado.form) estado.form = formVazio();
  mostrarTela('tela-app');
  irPara(estado.pedidos.length ? 'pedidos' : 'novo');
}

async function carregarTudo() {
  const [servicos, clientes, pedidos, config] = await Promise.all([
    db.listarServicos(), db.listarClientes(), db.listarPedidos(), db.lerConfig(),
  ]);
  estado.servicos = ordenarPorNome([...servicos]);
  estado.clientes = ordenarPorNome([...clientes]);
  estado.pedidos = [...pedidos];
  estado.config = config;
}

/** Troca de aba */
function irPara(aba) {
  if (aba === 'config' && estado.aba !== 'config') estado.abaAnterior = estado.aba;
  if (aba !== 'novo') estado.ultimoSalvo = null;
  estado.aba = aba;

  $('#topo-titulo').textContent = TITULOS[aba];
  $('#btn-voltar').classList.toggle('invisivel', aba !== 'config');
  $('#btn-config').classList.toggle('invisivel', aba === 'config');
  $$('.nav-item').forEach((b) => {
    const ativo = b.dataset.aba === aba;
    b.classList.toggle('ativo', ativo);
    if (ativo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}

/** Redesenha a aba atual */
function render() {
  const telas = { novo: renderNovo, pedidos: renderPedidos, clientes: renderClientes, resumo: renderResumo, config: renderConfig };
  telas[estado.aba]();
}
/** Redesenha a aba e o painel aberto (depois de mudar algum dado) */
function atualizarTela() {
  render();
  if (estado.atualizarFolha) estado.atualizarFolha();
}

function registrarServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* =========================================================
   5. ABA "NOVO PEDIDO"
   ========================================================= */
function formVazio() {
  return {
    editandoId: null,       // id do pedido quando está editando
    clienteId: null,
    nome: '',
    whatsapp: '',           // só números
    dataRecebimento: isoDeData(new Date()),
    previsaoEntrega: '',
    observacao: '',
    marcados: {},           // { idDoServico: { qtd, preco } }
    avulsos: [],            // [{ nome, preco, qtd }]  ("+ Outro serviço")
    formaPagamento: '',
    pago: false,
  };
}

/** Preenche o formulário com um pedido existente (para editar) */
function formDePedido(p) {
  const f = formVazio();
  Object.assign(f, {
    editandoId: p.id,
    clienteId: p.clienteId || null,
    nome: p.clienteNome || '',
    whatsapp: p.whatsapp || '',
    dataRecebimento: isoDeData(p.dataRecebimento),
    previsaoEntrega: isoDeData(p.previsaoEntrega),
    observacao: p.observacao || '',
    formaPagamento: p.formaPagamento || '',
    pago: !!p.pago,
  });
  const ativos = servicosAtivos();
  for (const item of p.itens || []) {
    const servico = ativos.find((s) => s.nome === item.nome && !f.marcados[s.id]);
    if (servico) f.marcados[servico.id] = { qtd: item.qtd, preco: item.preco };
    else f.avulsos.push({ nome: item.nome, preco: item.preco, qtd: item.qtd });
  }
  return f;
}

/** Lista final de itens do pedido, a partir do formulário */
function itensDoForm(f) {
  const itens = [];
  for (const s of servicosAtivos()) {
    const m = f.marcados[s.id];
    if (m) itens.push({ nome: s.nome, preco: m.preco, qtd: m.qtd });
  }
  for (const a of f.avulsos) {
    if (a.nome.trim() || a.preco > 0) itens.push({ nome: a.nome.trim() || 'Outro serviço', preco: a.preco, qtd: a.qtd || 1 });
  }
  return itens;
}
const totalDosItens = (itens) => Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100;
const atualizarTotal = () => {
  const el = $('#f-total');
  if (el) el.textContent = moeda(totalDosItens(itensDoForm(estado.form)));
};

function renderNovo() {
  const el = $('#conteudo');
  $('#topo-titulo').textContent = estado.form.editandoId && !estado.ultimoSalvo ? 'Editar pedido' : TITULOS.novo;
  if (estado.ultimoSalvo) {
    el.innerHTML = htmlSucesso();
    return;
  }
  const f = estado.form;
  const ativos = servicosAtivos();

  el.innerHTML = `
    ${f.editandoId ? `
      <div class="faixa-edicao">
        <span>✏️ Editando o pedido de <strong>${esc(f.nome)}</strong></span>
        <button type="button" class="link" data-acao="cancelar-edicao">Cancelar</button>
      </div>` : ''}

    <section class="card">
      <h2 class="card-titulo">👤 Cliente</h2>
      <div class="campo">
        <label for="f-nome">Nome do cliente</label>
        <input id="f-nome" type="text" autocomplete="off" autocapitalize="words" placeholder="Ex.: Maria" value="${esc(f.nome)}">
        <div id="sugestoes" class="sugestoes"></div>
      </div>
      <div class="campo">
        <label for="f-whats">WhatsApp</label>
        <input id="f-whats" type="tel" inputmode="tel" autocomplete="off" placeholder="(11) 98765-4321" value="${esc(formatarWhats(f.whatsapp))}">
      </div>
      <div class="campo">
        <label for="f-receb">Data que recebi a peça</label>
        <input id="f-receb" type="date" value="${f.dataRecebimento}">
      </div>
      <div class="campo">
        <label for="f-prev">Previsão de entrega <small>(opcional)</small></label>
        <input id="f-prev" type="date" value="${f.previsaoEntrega}">
      </div>
      <div class="campo">
        <label for="f-obs">Observação <small>(opcional)</small></label>
        <textarea id="f-obs" rows="2" placeholder="Ex.: calça jeans azul">${esc(f.observacao)}</textarea>
      </div>
    </section>

    <section class="card">
      <h2 class="card-titulo">🧵 Serviços</h2>
      <p class="dica">Marque o que vai fazer:</p>
      <div class="lista-servicos">
        ${ativos.map(htmlLinhaServico).join('') ||
          '<p class="dica">Nenhum serviço cadastrado. Cadastre em ⚙️ Configurações.</p>'}
      </div>
      <div id="avulsos">${htmlAvulsos()}</div>
      <button type="button" class="btn btn-contorno" data-acao="add-avulso">+ Outro serviço</button>
    </section>

    <section class="card">
      <h2 class="card-titulo">💳 Pagamento <small>(opcional)</small></h2>
      <div class="chips">
        ${FORMAS_PAGAMENTO.map((fp) => `
          <button type="button" class="chip ${f.formaPagamento === fp.nome ? 'ativo' : ''}"
            data-acao="forma" data-forma="${fp.nome}" aria-pressed="${f.formaPagamento === fp.nome}">
            <span class="chip-icone">${fp.icone}</span>${fp.nome}
          </button>`).join('')}
      </div>
      <label class="check-linha">
        <input type="checkbox" class="caixa" id="f-pago" ${f.pago ? 'checked' : ''}>
        <span>Já recebi o pagamento</span>
      </label>
    </section>

    <div class="card total-card">
      <span>Total</span>
      <strong id="f-total">${moeda(totalDosItens(itensDoForm(f)))}</strong>
    </div>

    <button type="button" class="btn btn-rosa btn-grande" data-acao="salvar-pedido">
      ${f.editandoId ? '💾 Salvar alterações' : '📋 Copiar e salvar'}
    </button>`;
}

/** Uma linha de serviço com caixinha de marcar */
function htmlLinhaServico(s) {
  const m = estado.form.marcados[s.id];
  return `
    <div class="servico ${m ? 'marcado' : ''}">
      <label class="servico-topo">
        <input type="checkbox" class="caixa" data-check-servico="${s.id}" ${m ? 'checked' : ''}>
        <span class="servico-nome">${esc(s.nome)}</span>
        <span class="servico-preco">${s.preco > 0 ? moeda(s.preco) : 'a combinar'}</span>
      </label>
      <div class="servico-extra">
        ${htmlQuantidade(m ? m.qtd : 1, `data-servico="${s.id}"`)}
        <label class="preco-ajuste">
          <span>Preço R$</span>
          <input type="text" class="campo-preco" inputmode="decimal" data-preco-servico="${s.id}"
            value="${valorCampo(m ? m.preco : s.preco)}" aria-label="Preço de ${esc(s.nome)} neste pedido">
        </label>
      </div>
    </div>`;
}

/** Controle − 1 + */
function htmlQuantidade(qtd, atributos) {
  return `
    <div class="qtd" role="group" aria-label="Quantidade">
      <button type="button" data-acao="qtd" data-delta="-1" ${atributos} aria-label="Diminuir">−</button>
      <span class="qtd-num">${qtd}</span>
      <button type="button" data-acao="qtd" data-delta="1" ${atributos} aria-label="Aumentar">+</button>
    </div>`;
}

/** Itens avulsos ("+ Outro serviço") */
function htmlAvulsos() {
  return estado.form.avulsos.map((a, i) => `
    <div class="avulso">
      <div class="campo">
        <label for="avulso-nome-${i}">Nome do serviço</label>
        <input id="avulso-nome-${i}" type="text" data-avulso-nome="${i}" value="${esc(a.nome)}" placeholder="Ex.: Pregar botão">
      </div>
      <div class="avulso-linha">
        <label class="preco-ajuste">
          <span>Valor R$</span>
          <input type="text" class="campo-preco" inputmode="decimal" data-avulso-preco="${i}"
            value="${a.preco ? valorCampo(a.preco) : ''}" placeholder="0,00">
        </label>
        ${htmlQuantidade(a.qtd || 1, `data-avulso="${i}"`)}
      </div>
      <button type="button" class="link link-perigo" data-acao="remover-avulso" data-i="${i}">🗑️ Remover este serviço</button>
    </div>`).join('');
}

/** Sugestões de clientes já cadastrados enquanto ela digita o nome */
function mostrarSugestoes() {
  const caixa = $('#sugestoes');
  if (!caixa) return;
  const f = estado.form;
  const busca = normalizar(f.nome);
  if (!busca) { caixa.innerHTML = ''; return; }
  const lista = estado.clientes
    .filter((c) => c.id !== f.clienteId && normalizar(c.nome).includes(busca))
    .sort((a, b) => normalizar(b.nome).startsWith(busca) - normalizar(a.nome).startsWith(busca))
    .slice(0, 4);
  caixa.innerHTML = lista.map((c) => `
    <button type="button" class="sugestao" data-acao="escolher-cliente" data-id="${c.id}">
      <span>👤 <strong>${esc(c.nome)}</strong></span>
      <span class="sugestao-whats">${esc(formatarWhats(c.whatsapp))}</span>
    </button>`).join('');
}

/** Acha o cliente pelo id ou pelo nome; se não existir, cria. */
async function garantirCliente(clienteId, nome, whatsapp) {
  let cliente = (clienteId && estado.clientes.find((c) => c.id === clienteId)) ||
    estado.clientes.find((c) => normalizar(c.nome) === normalizar(nome));

  if (cliente) {
    if (whatsapp && whatsapp !== cliente.whatsapp) {
      cliente = await db.salvarCliente({ ...cliente, whatsapp });
      estado.clientes = estado.clientes.map((c) => (c.id === cliente.id ? cliente : c));
    }
    return cliente;
  }
  cliente = await db.salvarCliente({ nome, whatsapp, criadoEm: new Date() });
  estado.clientes = ordenarPorNome([...estado.clientes, cliente]);
  return cliente;
}

/** Botão "Copiar e salvar" (ou "Salvar alterações") */
async function salvarPedidoDoForm(botao) {
  const f = estado.form;
  const itens = itensDoForm(f);

  if (!f.nome.trim()) {
    toast('✋ Escreva o nome do cliente.');
    $('#f-nome').focus();
    return;
  }
  if (!itens.length) {
    toast('✋ Marque pelo menos um serviço.');
    return;
  }
  const semPreco = itens.find((i) => !(i.preco > 0));
  if (semPreco) {
    toast(`✋ Coloque o preço de “${semPreco.nome}”.`);
    return;
  }

  const existente = f.editandoId ? acharPedido(f.editandoId) : null;
  const pedido = {
    id: existente ? existente.id : db.novoId(),
    clienteId: f.clienteId,
    clienteNome: f.nome.trim(),
    whatsapp: f.whatsapp,
    itens,
    total: totalDosItens(itens),
    dataRecebimento: dataDeIso(f.dataRecebimento) || new Date(),
    previsaoEntrega: dataDeIso(f.previsaoEntrega),
    dataEntrega: existente ? existente.dataEntrega || null : null,
    dataPagamento: f.pago ? ((existente && existente.pago && existente.dataPagamento) || new Date()) : null,
    formaPagamento: f.formaPagamento || null,
    entregue: existente ? !!existente.entregue : false,
    pago: f.pago,
    observacao: f.observacao.trim(),
    criadoEm: existente ? existente.criadoEm || new Date() : new Date(),
  };

  // Copia ANTES de salvar: o navegador só deixa copiar logo após o toque.
  const mensagem = gerarMensagem(pedido);
  const copiou = existente ? false : await copiarTexto(mensagem);

  botao.disabled = true;
  try {
    const cliente = await garantirCliente(f.clienteId, pedido.clienteNome, pedido.whatsapp);
    pedido.clienteId = cliente.id;
    await db.salvarPedido(pedido);
  } catch (erro) {
    console.error(erro);
    toast('Não consegui salvar. Verifique a internet e tente de novo.');
    botao.disabled = false;
    return;
  }

  if (existente) {
    estado.pedidos = estado.pedidos.map((p) => (p.id === pedido.id ? pedido : p));
    estado.form = formVazio();
    irPara('pedidos');
    toast('Alterações salvas ✅');
    return;
  }

  estado.pedidos.push(pedido);
  estado.form = formVazio();
  estado.ultimoSalvo = { pedido, mensagem, copiou };
  renderNovo();
  window.scrollTo(0, 0);
  toast(copiou ? 'Mensagem copiada! ✅' : 'Pedido salvo! ✅');
}

/** Tela depois de salvar: enviar no WhatsApp */
function htmlSucesso() {
  const { pedido, mensagem, copiou } = estado.ultimoSalvo;
  return `
    <section class="card sucesso">
      <h2 class="sucesso-titulo">${copiou ? 'Mensagem copiada! ✅' : 'Pedido salvo!'}</h2>
      <p>O pedido de <strong>${esc(pedido.clienteNome)}</strong> (${moeda(pedido.total)}) foi salvo.</p>
      <p class="dica">${copiou
        ? 'Agora é só enviar para a cliente pelo WhatsApp.'
        : 'Toque em “Copiar mensagem” ou envie direto pelo WhatsApp.'}</p>
      <div class="botoes-col">
        <a class="btn btn-verde btn-grande" href="${linkWhats(pedido.whatsapp, mensagem)}" target="_blank" rel="noopener">
          💬 Enviar no WhatsApp
        </a>
        <button type="button" class="btn btn-contorno" data-acao="copiar-ultima">📋 Copiar mensagem${copiou ? ' de novo' : ''}</button>
      </div>
      <details class="previa">
        <summary>Ver a mensagem</summary>
        <pre>${esc(mensagem)}</pre>
      </details>
    </section>
    <button type="button" class="btn btn-rosa btn-grande" data-acao="novo-pedido">+ Fazer outro pedido</button>`;
}

/* =========================================================
   6. MENSAGEM PARA A CLIENTE
   ========================================================= */
function gerarMensagem(p) {
  const cfg = estado.config;
  const linhas = [
    `Olá, ${p.clienteNome}!`,
    'Segue o resumo do seu pedido na *Consertos da Lili*:',
    '',
    '*Serviços:*',
    ...p.itens.map((i) => `- ${i.qtd}x ${i.nome}: ${moedaTexto(i.preco * i.qtd)}`),
    '',
    `*Total: ${moedaTexto(p.total)}*`,
  ];
  if (p.previsaoEntrega && !p.entregue) linhas.push(`*Previsão de entrega:* ${dataBR(p.previsaoEntrega)}`);

  if (p.pago) {
    linhas.push('', '*Pagamento recebido.*');
  } else if (cfg.chavePix) {
    linhas.push('', `*Pix para pagamento:* ${cfg.chavePix}`);
    if (cfg.titularPix) linhas.push(`(${cfg.titularPix})`);
  }
  linhas.push('', 'Muito obrigada pela confiança! Qualquer dúvida, é só chamar.');
  linhas.push(cfg.assinatura || 'Eliani Santos');
  return limparTextoWhats(linhas.join('\n'));
}

/** Tira emojis e símbolos que o WhatsApp mostra como "�".
    Mantém letras (com acento), números, pontuação comum, R$ e quebras de linha. */
function limparTextoWhats(texto) {
  return String(texto)
    .replace(/[–—]/g, '-')                 // travessões → hífen
    .replace(/[•·]/g, '-')                 // marcadores → hífen
    .replace(/[  ]/g, ' ')                 // espaços especiais → espaço comum
    .replace(/[^\n\x20-\x7EÀ-ÿ]/g, '')     // remove todo o resto (emojis etc.)
    .replace(/[ \t]+$/gm, '')                        // espaços sobrando no fim da linha
    .replace(/ {2,}/g, ' ');
}

/* =========================================================
   7. ABA "PEDIDOS"
   ========================================================= */
const ABAS_PEDIDOS = [
  ['costura', 'Em costura'],
  ['receber', 'A receber'],
  ['concluidos', 'Concluídos'],
];

function renderPedidos() {
  $('#conteudo').innerHTML = `
    <div class="busca">
      <span aria-hidden="true">🔍</span>
      <input id="busca-pedidos" type="search" placeholder="Buscar pelo nome do cliente" aria-label="Buscar pelo nome do cliente" value="${esc(estado.buscaPedidos)}">
    </div>
    <div class="abas" role="tablist">
      ${ABAS_PEDIDOS.map(([chave, rotulo]) => `
        <button type="button" role="tab" class="aba ${estado.filtroPedidos === chave ? 'ativa' : ''}"
          aria-selected="${estado.filtroPedidos === chave}" data-acao="filtro-pedidos" data-filtro="${chave}">
          <span>${rotulo}</span><span class="aba-num" data-num="${chave}"></span>
        </button>`).join('')}
    </div>
    <div id="lista-pedidos" class="pilha"></div>`;
  renderListaPedidos();
}

/** Só a lista (para a busca não fechar o teclado) */
function renderListaPedidos() {
  const busca = normalizar(estado.buscaPedidos);
  const daBusca = estado.pedidos.filter((p) => !busca || normalizar(p.clienteNome).includes(busca));

  // números nas abas
  for (const [chave] of ABAS_PEDIDOS) {
    const n = daBusca.filter((p) => categoria(p) === chave).length;
    const el = $(`[data-num="${chave}"]`);
    if (el) el.textContent = n === 1 ? '1 pedido' : `${n} pedidos`;
  }

  const lista = daBusca.filter((p) => categoria(p) === estado.filtroPedidos);
  const tempo = (d) => (d ? new Date(d).getTime() : Infinity);
  if (estado.filtroPedidos === 'costura') {
    // primeiro o que vence antes
    lista.sort((a, b) => tempo(a.previsaoEntrega) - tempo(b.previsaoEntrega) || tempo(a.dataRecebimento) - tempo(b.dataRecebimento));
  } else if (estado.filtroPedidos === 'receber') {
    lista.sort((a, b) => tempo(a.dataEntrega) - tempo(b.dataEntrega));
  } else {
    lista.sort((a, b) => tempo(b.dataPagamento) - tempo(a.dataPagamento));
  }

  const vazios = {
    costura: ['🎉', 'Nenhuma peça para costurar agora.'],
    receber: ['👏', 'Ninguém está devendo.'],
    concluidos: ['📦', 'Os pedidos entregues e pagos aparecem aqui.'],
  };
  const [emoji, texto] = vazios[estado.filtroPedidos];
  $('#lista-pedidos').innerHTML = lista.length
    ? lista.map(htmlCardPedido).join('')
    : `<div class="vazio"><div class="vazio-emoji">${busca ? '🔍' : emoji}</div>
         <p>${busca ? 'Nenhum pedido com esse nome aqui.' : texto}</p>
         ${estado.filtroPedidos === 'costura' && !busca ? '<button type="button" class="btn btn-rosa" data-acao="ir" data-aba="novo">+ Novo pedido</button>' : ''}
       </div>`;
}

const tag = (tipo, texto) => `<span class="tag tag-${tipo}">${texto}</span>`;
function etiquetas(p) {
  const t = [];
  if (!p.entregue) {
    t.push(tag('costura', '🧵 Em costura'));
    if (p.previsaoEntrega && inicioDoDia(p.previsaoEntrega) < inicioDoDia(new Date())) t.push(tag('atraso', '⏰ Atrasado'));
    if (p.pago) t.push(tag('pago', '✅ Já pago'));
  } else {
    t.push(tag('entregue', '📦 Entregue'));
    t.push(p.pago
      ? tag('pago', `✅ Pago${p.formaPagamento ? ' · ' + esc(p.formaPagamento) : ''}`)
      : tag('aguardando', '⏳ Aguardando pagamento'));
  }
  return t.join('');
}

function htmlCardPedido(p) {
  let datas = `📥 Recebido em ${dataBR(p.dataRecebimento)}`;
  if (!p.entregue && p.previsaoEntrega) datas += `<br>📅 Entregar até ${dataBR(p.previsaoEntrega)}`;
  if (p.entregue) datas += `<br>📦 Entregue em ${dataBR(p.dataEntrega)}`;
  return `
    <article class="card pedido" data-acao="abrir-pedido" data-id="${p.id}" tabindex="0">
      <div class="pedido-topo">
        <h3 class="pedido-nome">${esc(p.clienteNome)}</h3>
        <span class="pedido-total">${moeda(p.total)}</span>
      </div>
      <p class="pedido-info">${datas}</p>
      <p class="pedido-itens">${esc(resumoItens(p))}</p>
      <div class="etiquetas">${etiquetas(p)}</div>
      <div class="pedido-botoes">
        ${!p.entregue ? `<button type="button" class="btn-acao" data-acao="entreguei" data-id="${p.id}">✔ Entreguei</button>` : ''}
        ${!p.pago ? `<button type="button" class="btn-acao btn-acao-rosa" data-acao="recebi" data-id="${p.id}">✔ Recebi o pagamento</button>` : ''}
      </div>
      <p class="ver-mais">Toque para ver detalhes ›</p>
    </article>`;
}

/* ---------- Mudanças de situação (com "Desfazer") ---------- */
async function atualizarPedido(id, mudancas) {
  const antigo = acharPedido(id);
  if (!antigo) return;
  const novo = { ...antigo, ...mudancas };
  estado.pedidos = estado.pedidos.map((p) => (p.id === id ? novo : p));
  atualizarTela();
  try {
    await db.salvarPedido(novo);
  } catch (erro) {
    console.error(erro);
    toast('Não consegui salvar. Verifique a internet.');
  }
}

async function marcarEntregue(id) {
  const p = acharPedido(id);
  if (!p) return;
  const antes = { entregue: p.entregue, dataEntrega: p.dataEntrega || null };
  await atualizarPedido(id, { entregue: true, dataEntrega: new Date() });
  toast(`📦 Entrega de ${p.clienteNome} registrada!`, { acao: () => atualizarPedido(id, antes) });
}

async function marcarPago(id) {
  const p = acharPedido(id);
  if (!p) return;
  const forma = await escolherPagamento(p.formaPagamento);
  if (!forma) return;
  const antes = { pago: p.pago, dataPagamento: p.dataPagamento || null, formaPagamento: p.formaPagamento || null };
  await atualizarPedido(id, { pago: true, dataPagamento: new Date(), formaPagamento: forma });
  toast(`💰 Pagamento de ${p.clienteNome} registrado!`, { acao: () => atualizarPedido(id, antes) });
}

async function desfazerEntrega(id) {
  const p = acharPedido(id);
  const antes = { entregue: p.entregue, dataEntrega: p.dataEntrega };
  await atualizarPedido(id, { entregue: false, dataEntrega: null });
  toast('Entrega desfeita. O pedido voltou para “Em costura”.', { acao: () => atualizarPedido(id, antes) });
}

async function desfazerPagamento(id) {
  const p = acharPedido(id);
  const antes = { pago: p.pago, dataPagamento: p.dataPagamento, formaPagamento: p.formaPagamento };
  await atualizarPedido(id, { pago: false, dataPagamento: null });
  toast('Pagamento desfeito.', { acao: () => atualizarPedido(id, antes) });
}

/* ---------- Detalhes do pedido ---------- */
const linhaDetalhe = (rotulo, valor) => `<div class="det"><dt>${rotulo}</dt><dd>${valor}</dd></div>`;

function htmlDetalhePedido(p) {
  return `
    <h2 class="folha-titulo">${esc(p.clienteNome)}</h2>
    <div class="etiquetas">${etiquetas(p)}</div>

    <dl class="detalhes">
      ${linhaDetalhe('📱 WhatsApp', p.whatsapp ? esc(formatarWhats(p.whatsapp)) : 'Não informado')}
      ${linhaDetalhe('📥 Recebido em', dataBR(p.dataRecebimento))}
      ${p.previsaoEntrega ? linhaDetalhe('📅 Previsão', dataBR(p.previsaoEntrega)) : ''}
      ${p.entregue ? linhaDetalhe('📦 Entregue em', dataBR(p.dataEntrega)) : ''}
      ${p.pago
        ? linhaDetalhe('💰 Pago em', `${dataBR(p.dataPagamento)}${p.formaPagamento ? ' · ' + esc(p.formaPagamento) : ''}`)
        : p.formaPagamento ? linhaDetalhe('💳 Vai pagar com', esc(p.formaPagamento)) : ''}
      ${p.observacao ? linhaDetalhe('📝 Observação', esc(p.observacao)) : ''}
    </dl>

    <div class="itens-tabela">
      ${p.itens.map((i) => `
        <div class="item-linha"><span>${i.qtd}x ${esc(i.nome)}</span><span>${moeda(i.preco * i.qtd)}</span></div>`).join('')}
      <div class="item-linha item-total"><span>Total</span><span>${moeda(p.total)}</span></div>
    </div>

    <div class="botoes-col">
      ${!p.entregue ? `<button type="button" class="btn btn-teal btn-grande" data-acao="entreguei" data-id="${p.id}">✔ Entreguei</button>` : ''}
      ${!p.pago ? `<button type="button" class="btn btn-teal btn-grande" data-acao="recebi" data-id="${p.id}">✔ Recebi o pagamento</button>` : ''}
      <button type="button" class="btn btn-rosa" data-acao="copiar-pedido" data-id="${p.id}">📋 Copiar mensagem de novo</button>
      <a class="btn btn-verde" href="${linkWhats(p.whatsapp, gerarMensagem(p))}" target="_blank" rel="noopener">💬 Enviar no WhatsApp</a>
      <button type="button" class="btn btn-contorno" data-acao="editar-pedido" data-id="${p.id}">✏️ Editar pedido</button>
      ${p.entregue ? `<button type="button" class="btn btn-leve" data-acao="desfazer-entrega" data-id="${p.id}">↩️ Desfazer “Entreguei”</button>` : ''}
      ${p.pago ? `<button type="button" class="btn btn-leve" data-acao="desfazer-pagamento" data-id="${p.id}">↩️ Desfazer “Recebi o pagamento”</button>` : ''}
      <button type="button" class="btn btn-perigo" data-acao="excluir-pedido" data-id="${p.id}">🗑️ Excluir pedido</button>
    </div>`;
}

function abrirDetalhePedido(id) {
  const p = acharPedido(id);
  if (!p) return;
  abrirFolha(htmlDetalhePedido(p), () => {
    const atual = acharPedido(id);
    if (atual) trocarConteudoFolha(htmlDetalhePedido(atual));
    else fecharFolha();
  });
}

async function excluirPedido(id) {
  const p = acharPedido(id);
  if (!p) return;
  const ok = await perguntar({
    titulo: 'Excluir este pedido?',
    texto: `O pedido de <strong>${esc(p.clienteNome)}</strong> (${moeda(p.total)}) será apagado e não dá para recuperar.`,
    sim: 'Sim, excluir',
    perigo: true,
  });
  if (!ok) return;
  try {
    await db.excluirPedido(id);
  } catch (erro) {
    console.error(erro);
    toast('Não consegui excluir. Verifique a internet.');
    return;
  }
  estado.pedidos = estado.pedidos.filter((x) => x.id !== id);
  fecharFolha();
  render();
  toast('Pedido excluído.');
}

function editarPedido(id) {
  const p = acharPedido(id);
  if (!p) return;
  estado.form = formDePedido(p);
  estado.ultimoSalvo = null;
  fecharFolha();
  irPara('novo');
}

/* =========================================================
   8. ABA "CLIENTES"
   ========================================================= */
const pedidosDoCliente = (c) => estado.pedidos.filter((p) => p.clienteId === c.id);
function numerosDoCliente(c) {
  const pedidos = pedidosDoCliente(c);
  return {
    pedidos,
    gasto: somaTotais(pedidos.filter((p) => p.pago)),
    pendente: somaTotais(pedidos.filter((p) => !p.pago)),
  };
}

function renderClientes() {
  $('#conteudo').innerHTML = `
    <div class="busca">
      <span aria-hidden="true">🔍</span>
      <input id="busca-clientes" type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value="${esc(estado.buscaClientes)}">
    </div>
    <div id="lista-clientes" class="pilha"></div>`;
  renderListaClientes();
}

function renderListaClientes() {
  const busca = normalizar(estado.buscaClientes);
  const lista = estado.clientes.filter((c) => !busca || normalizar(c.nome).includes(busca));
  $('#lista-clientes').innerHTML = lista.length
    ? lista.map((c) => {
      const n = numerosDoCliente(c);
      return `
        <button type="button" class="card cliente" data-acao="abrir-cliente" data-id="${c.id}">
          <span class="cliente-topo">
            <span class="cliente-nome">${esc(c.nome)}</span>
            <span class="seta" aria-hidden="true">›</span>
          </span>
          <span class="cliente-info">📱 ${c.whatsapp ? esc(formatarWhats(c.whatsapp)) : 'Sem WhatsApp'} · ${n.pedidos.length} ${n.pedidos.length === 1 ? 'pedido' : 'pedidos'}</span>
          ${n.pendente > 0 ? `<span class="etiquetas">${tag('aguardando', `⏳ Deve ${moeda(n.pendente)}`)}</span>` : ''}
        </button>`;
    }).join('')
    : `<div class="vazio"><div class="vazio-emoji">👥</div>
         <p>${busca ? 'Nenhum cliente com esse nome.' : 'Os clientes aparecem aqui sozinhos quando você salva um pedido.'}</p></div>`;
}

function htmlDetalheCliente(c) {
  const n = numerosDoCliente(c);
  const historico = [...n.pedidos].sort((a, b) => new Date(b.dataRecebimento) - new Date(a.dataRecebimento));
  return `
    <h2 class="folha-titulo">${esc(c.nome)}</h2>
    <p class="dica">📱 ${c.whatsapp ? esc(formatarWhats(c.whatsapp)) : 'Sem WhatsApp cadastrado'}</p>

    <div class="numeros">
      <div class="numero"><span>Total gasto</span><strong>${moeda(n.gasto)}</strong></div>
      <div class="numero ${n.pendente > 0 ? 'numero-alerta' : ''}"><span>Valor pendente</span><strong>${moeda(n.pendente)}</strong></div>
    </div>

    <div class="botoes-col">
      <button type="button" class="btn btn-rosa" data-acao="novo-para-cliente" data-id="${c.id}">+ Novo pedido para ${esc(c.nome.split(' ')[0])}</button>
      ${c.whatsapp ? `<a class="btn btn-verde" href="${linkWhats(c.whatsapp)}" target="_blank" rel="noopener">💬 Chamar no WhatsApp</a>` : ''}
      <button type="button" class="btn btn-contorno" data-acao="editar-cliente" data-id="${c.id}">✏️ Editar nome ou WhatsApp</button>
    </div>

    <h3 class="subtitulo">Histórico de pedidos (${historico.length})</h3>
    <div class="lista-simples">
      ${historico.map((p) => `
        <button type="button" class="linha-lista" data-acao="abrir-pedido" data-id="${p.id}">
          <span>
            <strong>${dataBR(p.dataRecebimento)}</strong> · ${moeda(p.total)}<br>
            <small>${esc(resumoItens(p))}</small>
            <span class="etiquetas">${etiquetas(p)}</span>
          </span>
          <span class="seta" aria-hidden="true">›</span>
        </button>`).join('') || '<p class="dica">Nenhum pedido ainda.</p>'}
    </div>`;
}

function abrirDetalheCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  abrirFolha(htmlDetalheCliente(c), () => {
    const atual = estado.clientes.find((x) => x.id === id);
    if (atual) trocarConteudoFolha(htmlDetalheCliente(atual));
  });
}

function editarCliente(id) {
  const c = estado.clientes.find((x) => x.id === id);
  if (!c) return;
  estado.atualizarFolha = null; // não redesenhar por cima do formulário
  trocarConteudoFolha(`
    <h2 class="folha-titulo">Editar cliente</h2>
    <div class="campo"><label for="c-nome">Nome</label><input id="c-nome" type="text" value="${esc(c.nome)}"></div>
    <div class="campo"><label for="c-whats">WhatsApp</label><input id="c-whats" type="tel" inputmode="tel" value="${esc(formatarWhats(c.whatsapp))}"></div>
    <div class="botoes-col">
      <button type="button" class="btn btn-rosa" data-acao="salvar-cliente" data-id="${c.id}">💾 Salvar</button>
      <button type="button" class="btn btn-leve" data-acao="abrir-cliente" data-id="${c.id}">Cancelar</button>
    </div>`);
}

async function salvarClienteEditado(id, botao) {
  const antigo = estado.clientes.find((x) => x.id === id);
  const nome = $('#c-nome').value.trim();
  const whatsapp = soDigitos($('#c-whats').value);
  if (!nome) { toast('✋ Escreva o nome.'); return; }
  botao.disabled = true;
  try {
    const cliente = await db.salvarCliente({ ...antigo, nome, whatsapp });
    estado.clientes = ordenarPorNome(estado.clientes.map((c) => (c.id === id ? cliente : c)));
    // Atualiza o nome/WhatsApp nos pedidos dessa cliente
    for (const p of pedidosDoCliente(cliente)) {
      if (p.clienteNome !== nome || p.whatsapp !== whatsapp) {
        const novo = { ...p, clienteNome: nome, whatsapp };
        estado.pedidos = estado.pedidos.map((x) => (x.id === p.id ? novo : x));
        await db.salvarPedido(novo);
      }
    }
  } catch (erro) {
    console.error(erro);
    toast('Não consegui salvar. Verifique a internet.');
    botao.disabled = false;
    return;
  }
  render();
  abrirDetalheCliente(id);
  toast('Cliente atualizada ✅');
}

/* =========================================================
   9. ABA "RESUMO"
   ========================================================= */
function renderResumo() {
  const ref = estado.mesResumo;
  const ehMesAtual = mesmoMes(ref, new Date());

  const pagosNoMes = estado.pedidos.filter((p) => p.pago && mesmoMes(p.dataPagamento, ref));
  const pendentes = estado.pedidos.filter((p) => !p.pago);
  const emCostura = estado.pedidos.filter((p) => !p.entregue).length;
  const recebidosNoMes = estado.pedidos.filter((p) => mesmoMes(p.dataRecebimento, ref)).length;
  const entreguesNoMes = estado.pedidos.filter((p) => p.entregue && p.dataEntrega && mesmoMes(p.dataEntrega, ref));
  const media = entreguesNoMes.length
    ? entreguesNoMes.reduce((s, p) => s + Math.max(0, diasEntre(p.dataRecebimento, p.dataEntrega)), 0) / entreguesNoMes.length
    : null;
  const textoMedia = media === null
    ? '—'
    : `${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${media === 1 ? 'dia' : 'dias'}`;

  const cartao = (icone, rotulo, valor, sub, extra = '') => `
    <div class="card resumo-card ${extra}">
      <div class="resumo-icone" aria-hidden="true">${icone}</div>
      <div>
        <div class="resumo-rotulo">${rotulo}</div>
        <div class="resumo-valor">${valor}</div>
        <div class="resumo-sub">${sub}</div>
      </div>
    </div>`;

  pendentes.sort((a, b) => new Date(a.dataRecebimento) - new Date(b.dataRecebimento));

  $('#conteudo').innerHTML = `
    <div class="mes-nav">
      <button type="button" data-acao="mes" data-delta="-1" aria-label="Mês anterior">‹</button>
      <strong>${nomeDoMes(ref)}</strong>
      <button type="button" data-acao="mes" data-delta="1" aria-label="Próximo mês" ${ehMesAtual ? 'disabled' : ''}>›</button>
    </div>

    <div class="resumo-grade">
      ${cartao('💰', 'Saldo recebido no mês', moeda(somaTotais(pagosNoMes)),
        `${pagosNoMes.length} ${pagosNoMes.length === 1 ? 'pagamento' : 'pagamentos'}`, 'resumo-destaque')}
      ${cartao('⏳', 'A receber (total)', moeda(somaTotais(pendentes)),
        `${pendentes.length} ${pendentes.length === 1 ? 'pedido sem pagamento' : 'pedidos sem pagamento'}`)}
      ${cartao('🧵', 'Pedidos em costura', emCostura, 'peças para fazer agora')}
      ${cartao('⏱️', 'Tempo médio de entrega', textoMedia,
        entreguesNoMes.length ? `de ${entreguesNoMes.length} ${entreguesNoMes.length === 1 ? 'entrega' : 'entregas'} no mês` : 'sem entregas neste mês')}
      ${cartao('📥', 'Pedidos recebidos no mês', recebidosNoMes, 'peças que chegaram')}
    </div>

    <section class="card">
      <h2 class="card-titulo">⏳ Pagamentos pendentes</h2>
      <div class="lista-simples">
        ${pendentes.map((p) => `
          <button type="button" class="linha-lista" data-acao="abrir-pedido" data-id="${p.id}">
            <span>
              <strong>${esc(p.clienteNome)}</strong><br>
              <small>${p.entregue ? `📦 Entregue em ${dataBR(p.dataEntrega)}` : `🧵 Em costura · recebido ${dataCurta(p.dataRecebimento)}`}</small>
            </span>
            <span class="linha-valor">${moeda(p.total)}</span>
          </button>`).join('') || '<p class="dica">Tudo pago! 🎉</p>'}
      </div>
    </section>`;
}

/* =========================================================
   10. CONFIGURAÇÕES (Pix e serviços)
   ========================================================= */
function renderConfig() {
  const c = estado.config;
  const servicos = [...servicosAtivos(), ...estado.servicos.filter((s) => s.ativo === false)];
  $('#conteudo').innerHTML = `
    ${db.MODO_DEMO ? '<div class="faixa-edicao">🧪 <span><strong>Modo demonstração:</strong> os dados ficam só neste aparelho.</span></div>' : ''}

    <section class="card">
      <h2 class="card-titulo">📲 Dados do Pix</h2>
      <p class="dica">Aparecem no fim da mensagem enviada para a cliente.</p>
      <div class="campo"><label for="cfg-pix">Chave Pix</label>
        <input id="cfg-pix" type="text" autocapitalize="none" value="${esc(c.chavePix)}" placeholder="Celular, e-mail, CPF…"></div>
      <div class="campo"><label for="cfg-titular">Nome do titular do Pix</label>
        <input id="cfg-titular" type="text" value="${esc(c.titularPix)}" placeholder="Ex.: Liliane Souza"></div>
      <div class="campo"><label for="cfg-assinatura">Assinatura da mensagem</label>
        <input id="cfg-assinatura" type="text" value="${esc(c.assinatura)}" placeholder="Ex.: Eliani Santos"></div>
      <button type="button" class="btn btn-rosa" data-acao="salvar-config">💾 Salvar dados do Pix</button>
    </section>

    <section class="card">
      <h2 class="card-titulo">🧵 Serviços e preços</h2>
      <p class="dica">Toque em um serviço para mudar o nome, o preço ou desativar.</p>
      <div class="lista-simples">
        ${servicos.map((s) => `
          <button type="button" class="linha-lista ${s.ativo === false ? 'inativo' : ''}" data-acao="abrir-servico" data-id="${s.id}">
            <span>${esc(s.nome)}</span>
            <span class="linha-valor">${s.ativo === false ? 'Desativado' : s.preco > 0 ? moeda(s.preco) : 'sem preço'} ›</span>
          </button>`).join('')}
      </div>
      <div class="botoes-col">
        <button type="button" class="btn btn-contorno" data-acao="abrir-servico" data-id="">+ Adicionar serviço</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-titulo">👩 Conta</h2>
      <p>${db.MODO_DEMO ? 'Entrou como <strong>lili</strong> (teste).' : `Entrou como <strong>${esc(estado.usuario)}</strong>.`}</p>
      <div class="botoes-col">
        ${db.MODO_DEMO ? '<button type="button" class="btn btn-leve" data-acao="apagar-demo">🧹 Apagar dados de teste</button>' : ''}
        <button type="button" class="btn btn-perigo" data-acao="sair">🚪 Sair da conta</button>
      </div>
    </section>`;
}

async function salvarConfig(botao) {
  botao.disabled = true;
  try {
    estado.config = await db.salvarConfig({
      chavePix: $('#cfg-pix').value.trim(),
      titularPix: $('#cfg-titular').value.trim(),
      assinatura: $('#cfg-assinatura').value.trim(),
    });
    toast('Dados salvos ✅');
  } catch (erro) {
    console.error(erro);
    toast('Não consegui salvar. Verifique a internet.');
  }
  botao.disabled = false;
}

function abrirServico(id) {
  const s = id ? estado.servicos.find((x) => x.id === id) : { nome: '', preco: 0, ativo: true };
  if (!s) return;
  abrirFolha(`
    <h2 class="folha-titulo">${id ? 'Editar serviço' : 'Novo serviço'}</h2>
    <div class="campo"><label for="s-nome">Nome do serviço</label>
      <input id="s-nome" type="text" value="${esc(s.nome)}" placeholder="Ex.: Barra de calça"></div>
    <div class="campo"><label for="s-preco">Preço (R$)</label>
      <input id="s-preco" type="text" class="campo-preco" inputmode="decimal" value="${s.preco ? valorCampo(s.preco) : ''}" placeholder="0,00"></div>
    <label class="check-linha">
      <input type="checkbox" class="caixa" id="s-ativo" ${s.ativo !== false ? 'checked' : ''}>
      <span>Mostrar na lista do Novo pedido</span>
    </label>
    <div class="botoes-col">
      <button type="button" class="btn btn-rosa" data-acao="salvar-servico" data-id="${id || ''}">💾 Salvar</button>
      <button type="button" class="btn btn-leve" data-acao="fechar-folha">Cancelar</button>
    </div>`);
  if (!id) $('#s-nome').focus();
}

async function salvarServico(id, botao) {
  const nome = $('#s-nome').value.trim();
  if (!nome) { toast('✋ Escreva o nome do serviço.'); return; }
  botao.disabled = true;
  try {
    const salvo = await db.salvarServico({
      id: id || null,
      nome,
      preco: lerValor($('#s-preco').value),
      ativo: $('#s-ativo').checked,
    });
    const outros = estado.servicos.filter((s) => s.id !== salvo.id);
    estado.servicos = ordenarPorNome([...outros, salvo]);
    // Se foi desativado, tira do rascunho do novo pedido
    if (!salvo.ativo && estado.form) delete estado.form.marcados[salvo.id];
  } catch (erro) {
    console.error(erro);
    toast('Não consegui salvar. Verifique a internet.');
    botao.disabled = false;
    return;
  }
  fecharFolha();
  render();
  toast('Serviço salvo ✅');
}

/* =========================================================
   11. CLIQUES E DIGITAÇÃO
   ---------------------------------------------------------
   Todo botão tem data-acao="nome". O mapa abaixo diz o que
   cada um faz. (Fica num lugar só, fácil de achar.)
   ========================================================= */
const acoes = {
  /* --- início e login --- */
  'comecar': () => { mostrarTela('tela-login'); setTimeout(() => $('#login-usuario').focus(), 50); },
  'voltar-inicio': () => mostrarTela('tela-inicio'),
  'ver-senha': (el) => {
    const campo = $('#login-senha');
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    el.textContent = mostrar ? 'Esconder' : 'Mostrar';
  },

  /* --- navegação --- */
  'ir': (el) => {
    // tocar em "Novo pedido" de novo depois de salvar → formulário limpo
    if (el.dataset.aba === 'novo' && estado.aba === 'novo') estado.ultimoSalvo = null;
    irPara(el.dataset.aba);
  },
  'abrir-config': () => irPara('config'),
  'voltar': () => irPara(estado.abaAnterior || 'pedidos'),
  'fechar-folha': () => fecharFolha(),

  /* --- novo pedido --- */
  'qtd': (el) => {
    const f = estado.form;
    const delta = Number(el.dataset.delta);
    let item;
    if (el.dataset.servico) item = f.marcados[el.dataset.servico];
    else if (el.dataset.avulso !== undefined) item = f.avulsos[Number(el.dataset.avulso)];
    if (!item) return;
    item.qtd = Math.max(1, Math.min(99, (item.qtd || 1) + delta));
    el.closest('.qtd').querySelector('.qtd-num').textContent = item.qtd;
    atualizarTotal();
  },
  'add-avulso': () => {
    estado.form.avulsos.push({ nome: '', preco: 0, qtd: 1 });
    $('#avulsos').innerHTML = htmlAvulsos();
    $(`#avulso-nome-${estado.form.avulsos.length - 1}`).focus();
  },
  'remover-avulso': (el) => {
    estado.form.avulsos.splice(Number(el.dataset.i), 1);
    $('#avulsos').innerHTML = htmlAvulsos();
    atualizarTotal();
  },
  'forma': (el) => {
    const f = estado.form;
    f.formaPagamento = f.formaPagamento === el.dataset.forma ? '' : el.dataset.forma;
    $$('.chip').forEach((c) => {
      const ativo = c.dataset.forma === f.formaPagamento;
      c.classList.toggle('ativo', ativo);
      c.setAttribute('aria-pressed', ativo);
    });
  },
  'escolher-cliente': (el) => {
    const c = estado.clientes.find((x) => x.id === el.dataset.id);
    if (!c) return;
    Object.assign(estado.form, { clienteId: c.id, nome: c.nome, whatsapp: c.whatsapp || '' });
    $('#f-nome').value = c.nome;
    $('#f-whats').value = formatarWhats(c.whatsapp);
    $('#sugestoes').innerHTML = '';
  },
  'salvar-pedido': (el) => salvarPedidoDoForm(el),
  'cancelar-edicao': () => { estado.form = formVazio(); renderNovo(); },
  'novo-pedido': () => {
    estado.ultimoSalvo = null;
    estado.form = formVazio();
    renderNovo();
    window.scrollTo(0, 0);
  },
  'copiar-ultima': () => copiarComAviso(estado.ultimoSalvo.mensagem),

  /* --- pedidos --- */
  'filtro-pedidos': (el) => { estado.filtroPedidos = el.dataset.filtro; renderPedidos(); },
  'abrir-pedido': (el) => abrirDetalhePedido(el.dataset.id),
  'entreguei': (el) => marcarEntregue(el.dataset.id),
  'recebi': (el) => marcarPago(el.dataset.id),
  'desfazer-entrega': (el) => desfazerEntrega(el.dataset.id),
  'desfazer-pagamento': (el) => desfazerPagamento(el.dataset.id),
  'copiar-pedido': (el) => copiarComAviso(gerarMensagem(acharPedido(el.dataset.id))),
  'editar-pedido': (el) => editarPedido(el.dataset.id),
  'excluir-pedido': (el) => excluirPedido(el.dataset.id),

  /* --- clientes --- */
  'abrir-cliente': (el) => abrirDetalheCliente(el.dataset.id),
  'editar-cliente': (el) => editarCliente(el.dataset.id),
  'salvar-cliente': (el) => salvarClienteEditado(el.dataset.id, el),
  'novo-para-cliente': (el) => {
    const c = estado.clientes.find((x) => x.id === el.dataset.id);
    if (!c) return;
    estado.form = Object.assign(formVazio(), { clienteId: c.id, nome: c.nome, whatsapp: c.whatsapp || '' });
    estado.ultimoSalvo = null;
    fecharFolha();
    irPara('novo');
  },

  /* --- resumo --- */
  'mes': (el) => {
    const d = estado.mesResumo;
    estado.mesResumo = new Date(d.getFullYear(), d.getMonth() + Number(el.dataset.delta), 1);
    renderResumo();
  },

  /* --- configurações --- */
  'salvar-config': (el) => salvarConfig(el),
  'abrir-servico': (el) => abrirServico(el.dataset.id),
  'salvar-servico': (el) => salvarServico(el.dataset.id, el),
  'sair': async () => {
    if (await perguntar({ titulo: 'Sair da conta?', texto: 'Para entrar de novo, vai precisar do usuário e da senha.', sim: 'Sim, sair' })) {
      await db.sair();
    }
  },
  'apagar-demo': async () => {
    if (await perguntar({ titulo: 'Apagar dados de teste?', texto: 'Todos os pedidos e clientes de teste serão apagados.', sim: 'Sim, apagar', perigo: true })) {
      db.apagarDadosDemo();
      location.reload();
    }
  },
};

/* Cliques */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-acao]');
  if (!el || el.disabled) return;
  const acao = acoes[el.dataset.acao];
  if (!acao) return;
  e.preventDefault();
  acao(el, e);
});

/* Enter/Espaço em cartões (acessibilidade no computador) */
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article[data-acao]')) {
    e.preventDefault();
    e.target.click();
  }
});

/* Digitação */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'busca-pedidos') { estado.buscaPedidos = t.value; renderListaPedidos(); return; }
  if (t.id === 'busca-clientes') { estado.buscaClientes = t.value; renderListaClientes(); return; }

  const f = estado.form;
  if (!f || estado.aba !== 'novo' || !t.closest('#conteudo')) return;

  if (t.id === 'f-nome') { f.nome = t.value; f.clienteId = null; mostrarSugestoes(); }
  else if (t.id === 'f-whats') f.whatsapp = soDigitos(t.value);
  else if (t.id === 'f-receb') f.dataRecebimento = t.value;
  else if (t.id === 'f-prev') f.previsaoEntrega = t.value;
  else if (t.id === 'f-obs') f.observacao = t.value;
  else if (t.dataset.precoServico) {
    const m = f.marcados[t.dataset.precoServico];
    if (m) m.preco = lerValor(t.value);
    atualizarTotal();
  } else if (t.dataset.avulsoNome !== undefined) {
    f.avulsos[Number(t.dataset.avulsoNome)].nome = t.value;
  } else if (t.dataset.avulsoPreco !== undefined) {
    f.avulsos[Number(t.dataset.avulsoPreco)].preco = lerValor(t.value);
    atualizarTotal();
  }
});

/* Caixinhas de marcar */
document.addEventListener('change', (e) => {
  const t = e.target;
  const f = estado.form;
  if (!f || estado.aba !== 'novo') return;

  if (t.dataset.checkServico) {
    const id = t.dataset.checkServico;
    const s = estado.servicos.find((x) => x.id === id);
    const linha = t.closest('.servico');
    if (t.checked) f.marcados[id] = { qtd: 1, preco: s.preco };
    else delete f.marcados[id];
    linha.classList.toggle('marcado', t.checked);
    $('.qtd-num', linha).textContent = '1';
    $('.campo-preco', linha).value = valorCampo(s.preco);
    atualizarTotal();
    // Serviço sem preço: já leva o dedo para o campo de preço
    if (t.checked && !(s.preco > 0)) $('.campo-preco', linha).select();
  } else if (t.id === 'f-pago') {
    f.pago = t.checked;
  }
});

/* Ao sair de um campo: arruma o formato (preço "20" → "20,00", WhatsApp com parênteses) */
document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('campo-preco') && t.value.trim()) t.value = valorCampo(lerValor(t.value));
  if (t.id === 'f-whats' || t.id === 'c-whats') t.value = formatarWhats(t.value);
});

/* Formulário de login */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('#login-usuario').value.trim();
  const senha = $('#login-senha').value;
  const erro = $('#login-erro');
  erro.hidden = true;
  if (!usuario || !senha) {
    erro.textContent = 'Preencha o usuário e a senha.';
    erro.hidden = false;
    return;
  }
  const botao = $('#btn-entrar');
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  try {
    await db.entrar(usuario, senha);
    $('#login-senha').value = '';
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

/* Fechar o painel tocando fora dele */
$('#folha').addEventListener('click', (e) => {
  if (e.target.id === 'folha') fecharFolha();
});

iniciar();
