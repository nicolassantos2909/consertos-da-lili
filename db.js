/* =========================================================
   Consertos da Lili — db.js
   ---------------------------------------------------------
   TODO o acesso a dados passa por aqui. O resto do app não
   sabe se está usando Firebase ou o modo demonstração:
   as funções exportadas são as mesmas nos dois casos.

   Datas: o app trabalha sempre com objetos Date do JavaScript.
   - No Firebase, elas são gravadas como Timestamp.
   - No modo demonstração, são gravadas no localStorage.
   ========================================================= */

import { firebaseConfig, DOMINIO_USUARIO } from './firebase-config.js';

/** true quando firebase-config.js está vazio */
export const MODO_DEMO = !(firebaseConfig && firebaseConfig.apiKey);

const VERSAO_FIREBASE = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${VERSAO_FIREBASE}`;

/** Serviços cadastrados na primeira vez que o app abre (dá para mudar em Configurações) */
export const SERVICOS_INICIAIS = [
  { nome: 'Barra desfiada', preco: 20 },
  { nome: 'Barra italiana', preco: 20 },
  { nome: 'Barra original', preco: 18 },
  { nome: 'Barra social', preco: 20 },
  { nome: 'Barra pantalona/Flare', preco: 20 },
  { nome: 'Barra postiça', preco: 20 },
  { nome: 'Cós alargar com nesgas laterais', preco: 30 },
  { nome: 'Cós ajustar', preco: 23 },
  { nome: 'Troca Zíper (somente serviço)', preco: 18 },
  { nome: 'Trocar elástico cintura', preco: 0 }, // preço ainda não definido
];

export const CONFIG_PADRAO = { chavePix: '', titularPix: '', assinatura: 'Eliani Santos' };

/* O "adaptador" é o objeto que realmente lê e grava.
   Os dois adaptadores (demo e Firebase) têm os mesmos métodos:
   entrar, sair, observarLogin, listar, ler, gravar, excluir, novoId */
let adaptador = null;

/* =========================================================
   1. MODO DEMONSTRAÇÃO (localStorage)
   ========================================================= */
const PREFIXO = 'lili_demo_';

// Converte Date → {__data: "..."} ao salvar, e de volta ao ler
function substituirDatas(chave, valor) {
  const original = this[chave];
  return original instanceof Date ? { __data: original.toISOString() } : valor;
}
function reviverDatas(chave, valor) {
  return valor && typeof valor === 'object' && valor.__data ? new Date(valor.__data) : valor;
}
function demoLerColecao(colecao) {
  try {
    return JSON.parse(localStorage.getItem(PREFIXO + colecao) || '{}', reviverDatas);
  } catch {
    return {};
  }
}
function demoGravarColecao(colecao, objeto) {
  localStorage.setItem(PREFIXO + colecao, JSON.stringify(objeto, substituirDatas));
}
function demoGravar(colecao, id, dados) {
  const tudo = demoLerColecao(colecao);
  const { id: _ignorado, ...semId } = dados;
  tudo[id] = semId;
  demoGravarColecao(colecao, tudo);
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function criarAdaptadorDemo() {
  let ouvinteLogin = null;
  const usuarioLogado = () => (localStorage.getItem(PREFIXO + 'logado') ? { usuario: 'lili' } : null);

  semearDemo();

  return {
    async entrar(usuario, senha) {
      if (usuario.trim().toLowerCase() === 'lili' && senha === '1234') {
        localStorage.setItem(PREFIXO + 'logado', '1');
        ouvinteLogin && ouvinteLogin(usuarioLogado());
        return;
      }
      throw new Error('Usuário ou senha incorretos.');
    },
    async sair() {
      localStorage.removeItem(PREFIXO + 'logado');
      ouvinteLogin && ouvinteLogin(null);
    },
    observarLogin(callback) {
      ouvinteLogin = callback;
      callback(usuarioLogado());
    },
    async listar(colecao) {
      return Object.entries(demoLerColecao(colecao)).map(([id, dados]) => ({ ...dados, id }));
    },
    async ler(colecao, id) {
      const dados = demoLerColecao(colecao)[id];
      return dados ? { ...dados, id } : null;
    },
    async gravar(colecao, id, dados) {
      demoGravar(colecao, id, dados);
    },
    async excluir(colecao, id) {
      const tudo = demoLerColecao(colecao);
      delete tudo[id];
      demoGravarColecao(colecao, tudo);
    },
    novoId: gerarId,
  };
}

/** Cria dados de exemplo na primeira vez, para dar para testar todas as telas */
function semearDemo() {
  if (localStorage.getItem(PREFIXO + 'semeado')) return;

  const diasAtras = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  SERVICOS_INICIAIS.forEach((s, i) => demoGravar('servicos', 'inicial_' + (i + 1), { ...s, ativo: true }));

  demoGravar('clientes', 'c1', { nome: 'Maria Souza', whatsapp: '11987654321', criadoEm: diasAtras(30) });
  demoGravar('clientes', 'c2', { nome: 'Ana Paula', whatsapp: '21912345678', criadoEm: diasAtras(10) });
  demoGravar('clientes', 'c3', { nome: 'Joana Lima', whatsapp: '31998765432', criadoEm: diasAtras(14) });

  const pedido = (dados) => ({
    previsaoEntrega: null, dataEntrega: null, dataPagamento: null, formaPagamento: null,
    entregue: false, pago: false, observacao: '', ...dados,
  });

  demoGravar('pedidos', 'p1', pedido({
    clienteId: 'c1', clienteNome: 'Maria Souza', whatsapp: '11987654321',
    itens: [{ nome: 'Barra original', preco: 18, qtd: 2 }], total: 36,
    dataRecebimento: diasAtras(3), previsaoEntrega: diasAtras(-2), criadoEm: diasAtras(3),
    observacao: 'Duas calças jeans azuis',
  }));
  demoGravar('pedidos', 'p2', pedido({
    clienteId: 'c2', clienteNome: 'Ana Paula', whatsapp: '21912345678',
    itens: [{ nome: 'Cós ajustar', preco: 23, qtd: 1 }, { nome: 'Troca Zíper (somente serviço)', preco: 18, qtd: 1 }],
    total: 41, dataRecebimento: diasAtras(8), dataEntrega: diasAtras(2), entregue: true, criadoEm: diasAtras(8),
  }));
  demoGravar('pedidos', 'p3', pedido({
    clienteId: 'c3', clienteNome: 'Joana Lima', whatsapp: '31998765432',
    itens: [{ nome: 'Barra social', preco: 20, qtd: 1 }], total: 20,
    dataRecebimento: diasAtras(12), dataEntrega: diasAtras(6), dataPagamento: diasAtras(6),
    formaPagamento: 'Pix', entregue: true, pago: true, criadoEm: diasAtras(12),
  }));
  demoGravar('pedidos', 'p4', pedido({
    clienteId: 'c1', clienteNome: 'Maria Souza', whatsapp: '11987654321',
    itens: [{ nome: 'Barra italiana', preco: 20, qtd: 1 }], total: 20,
    dataRecebimento: diasAtras(1), dataPagamento: diasAtras(1), formaPagamento: 'Dinheiro',
    pago: true, criadoEm: diasAtras(1),
  }));

  demoGravar('config', 'geral', {
    chavePix: 'lili@exemplo.com', titularPix: 'Eliani Santos', assinatura: 'Eliani Santos',
  });

  localStorage.setItem(PREFIXO + 'semeado', '1');
}

/** Apaga tudo do modo demonstração (botão em Configurações) */
export function apagarDadosDemo() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIXO))
    .forEach((k) => localStorage.removeItem(k));
}

/* =========================================================
   2. MODO FIREBASE (Authentication + Firestore)
   ========================================================= */
function traduzirErroLogin(erro) {
  const codigo = (erro && erro.code) || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found',
    'auth/invalid-email', 'auth/invalid-login-credentials'].includes(codigo)) {
    return 'Usuário ou senha incorretos.';
  }
  if (codigo === 'auth/too-many-requests') return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (codigo === 'auth/network-request-failed') return 'Sem internet. Verifique a conexão e tente de novo.';
  return 'Não foi possível entrar. Tente de novo.';
}

async function criarAdaptadorFirebase() {
  // Carrega o SDK modular direto do CDN do Google
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  await A.setPersistence(auth, A.browserLocalPersistence); // continua logada no aparelho

  // Cache local: o app abre e mostra os dados mesmo com internet fraca
  let banco;
  try {
    banco = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    banco = F.getFirestore(app);
  }

  // Date → Timestamp (ao gravar)
  const paraFirestore = (dados) => {
    const saida = {};
    for (const [chave, valor] of Object.entries(dados)) {
      if (chave === 'id') continue;
      saida[chave] = valor instanceof Date ? F.Timestamp.fromDate(valor) : valor === undefined ? null : valor;
    }
    return saida;
  };
  // Timestamp → Date (ao ler)
  const deFirestore = (snap) => {
    const dados = snap.data();
    for (const [chave, valor] of Object.entries(dados)) {
      if (valor instanceof F.Timestamp) dados[chave] = valor.toDate();
    }
    return { ...dados, id: snap.id };
  };
  // Sem internet, o Firestore guarda a gravação e envia depois.
  // Não deixamos a tela "travada" esperando o servidor responder.
  const semTravar = (promessa) => Promise.race([promessa, new Promise((ok) => setTimeout(ok, 4000))]);

  return {
    async entrar(usuario, senha) {
      const u = usuario.trim().toLowerCase();
      const email = u.includes('@') ? u : `${u}@${DOMINIO_USUARIO}`;
      try {
        await A.signInWithEmailAndPassword(auth, email, senha);
      } catch (erro) {
        throw new Error(traduzirErroLogin(erro));
      }
    },
    sair: () => A.signOut(auth),
    observarLogin(callback) {
      A.onAuthStateChanged(auth, (u) => callback(u ? { usuario: u.email.split('@')[0] } : null));
    },
    async listar(colecao) {
      const snap = await F.getDocs(F.collection(banco, colecao));
      const lista = snap.docs.map(deFirestore);
      lista.doCache = snap.metadata.fromCache; // true = sem internet, veio do aparelho
      return lista;
    },
    async ler(colecao, id) {
      const snap = await F.getDoc(F.doc(banco, colecao, id));
      return snap.exists() ? deFirestore(snap) : null;
    },
    gravar: (colecao, id, dados) => semTravar(F.setDoc(F.doc(banco, colecao, id), paraFirestore(dados))),
    excluir: (colecao, id) => semTravar(F.deleteDoc(F.doc(banco, colecao, id))),
    novoId: () => F.doc(F.collection(banco, 'pedidos')).id,
  };
}

/* =========================================================
   3. FUNÇÕES USADAS PELO APP (iguais nos dois modos)
   ========================================================= */

/** Precisa ser chamada uma vez, antes de tudo */
export async function iniciar() {
  adaptador = MODO_DEMO ? criarAdaptadorDemo() : await criarAdaptadorFirebase();
}

/* ---------- Login ---------- */
export const entrar = (usuario, senha) => adaptador.entrar(usuario, senha);
export const sair = () => adaptador.sair();
/** callback recebe {usuario} quando logada, ou null quando deslogada */
export const observarLogin = (callback) => adaptador.observarLogin(callback);

/** Gera um id novo para um documento (pedido, cliente ou serviço) */
export const novoId = () => adaptador.novoId();

/* ---------- Serviços ---------- */
export async function listarServicos() {
  let lista = await adaptador.listar('servicos');
  // Primeira vez (e com internet): cadastra os serviços de exemplo
  if (!lista.length && !lista.doCache) {
    await Promise.all(SERVICOS_INICIAIS.map((s, i) =>
      adaptador.gravar('servicos', 'inicial_' + (i + 1), { ...s, ativo: true })));
    lista = SERVICOS_INICIAIS.map((s, i) => ({ ...s, ativo: true, id: 'inicial_' + (i + 1) }));
  }
  return lista;
}
/** Cria (sem id) ou atualiza (com id). Devolve o serviço com id. */
export async function salvarServico(servico) {
  const id = servico.id || novoId();
  const dados = { nome: servico.nome, preco: Number(servico.preco) || 0, ativo: servico.ativo !== false };
  await adaptador.gravar('servicos', id, dados);
  return { ...dados, id };
}

/* ---------- Clientes ---------- */
export const listarClientes = () => adaptador.listar('clientes');
export async function salvarCliente(cliente) {
  const id = cliente.id || novoId();
  const dados = { nome: cliente.nome, whatsapp: cliente.whatsapp || '', criadoEm: cliente.criadoEm || new Date() };
  await adaptador.gravar('clientes', id, dados);
  return { ...dados, id };
}

/* ---------- Pedidos ---------- */
export const listarPedidos = () => adaptador.listar('pedidos');
/** O pedido precisa ter id (use novoId() para criar um novo) */
export async function salvarPedido(pedido) {
  await adaptador.gravar('pedidos', pedido.id, pedido);
  return pedido;
}
export const excluirPedido = (id) => adaptador.excluir('pedidos', id);

/* ---------- Configurações (Pix, assinatura) ---------- */
export async function lerConfig() {
  const dados = await adaptador.ler('config', 'geral');
  const { id, ...resto } = dados || {};
  return { ...CONFIG_PADRAO, ...resto };
}
export async function salvarConfig(config) {
  const dados = {
    chavePix: config.chavePix || '',
    titularPix: config.titularPix || '',
    assinatura: config.assinatura || '',
  };
  await adaptador.gravar('config', 'geral', dados);
  return dados;
}
