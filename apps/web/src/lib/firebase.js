// ───────────────────────────────────────────────────────────────────────────
//  Firebase Realtime Database — sincronização em tempo real entre dispositivos
// ───────────────────────────────────────────────────────────────────────────
// Mantém o IndexedDB (Dexie) como fallback offline e espelha os registros de
// entrega (PPL_Historico) e a base de PPL (PPL_Base) no Firebase. Um ouvinte
// onValue() mescla automaticamente as mudanças remotas no banco local, e a UI
// reativa (liveQuery) atualiza a tela sem recarregar a página.
import { initializeApp } from '@firebase/app';
import {
    getDatabase,
    ref,
    set,
    update,
    remove,
    onValue,
    get,
    push,
    serverTimestamp,
} from '@firebase/database';
import { db } from './db';

const firebaseConfig = {
    apiKey: 'AIzaSyCSpDOQu75J3au4pim67lx-Ur8_pC3raiM',
    authDomain: 'sedexesacolas.firebaseapp.com',
    databaseURL: 'https://sedexesacolas-default-rtdb.firebaseio.com',
    projectId: 'sedexesacolas',
    storageBucket: 'sedexesacolas.firebasestorage.app',
    messagingSenderId: '327290318196',
    appId: '1:327290318196:web:02d2e0a4d9413ca3da1021',
    measurementId: 'G-LYZBSC1XE0',
};

const app = initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);

// Estado de conectividade/pronto (para feedback na UI)
let ouvinteAtivo = false;
const listeners = new Set();
export function onSyncStatus(cb) {
    listeners.add(cb);
    cb(ouvinteAtivo);
    return () => listeners.delete(cb);
}
function emitStatus() {
    listeners.forEach((cb) => cb(ouvinteAtivo));
}

// ─── Helpers de chave e data ───────────────────────────────────────────────
/** Gera uma chave única no Realtime Database sem gravar nada. */
export function gerarChave(caminho = 'registros') {
    return push(ref(rtdb, caminho)).key;
}

/** Converte um ISO para data YYYY-MM-DD no fuso America/Sao_Paulo. */
export function dataLocalISO(iso) {
    if (!iso) return '';
    const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const [dd, mm, yyyy] = fmt.format(new Date(iso)).split('/');
    return `${yyyy}-${mm}-${dd}`;
}

/** Data de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function dataHojeISO() {
    return dataLocalISO(new Date().toISOString());
}

/** Caminho da pasta de data para um registro: registros/{ANO-MES-DIA}/{key} */
function caminhoRegistro(key, dataISO) {
    const data = dataISO || dataHojeISO();
    return `registros/${data}/${key}`;
}

// ─── Registros de entrega (PPL_Historico) ──────────────────────────────────
/**
 * Envia (ou atualiza) um registro de entrega no Firebase, organizado pela data
 * do registro: registros/{ANO-MES-DIA}/{key}.
 * @param {object} registro registro local (deve conter fbKey e criadoEm)
 * @returns {Promise<string>} a chave usada no Firebase
 */
export async function salvarRegistroFirebase(registro) {
    const key = registro.fbKey || gerarChave('registros');
    const data = dataLocalISO(registro.criadoEm) || dataHojeISO();
    const { id, ...resto } = registro; // o id local não é significativo entre dispositivos
    const payload = { ...resto, fbKey: key, syncAt: Date.now() };
    await set(ref(rtdb, caminhoRegistro(key, data)), payload);
    return key;
}

/** Atualiza parcialmente um registro no Firebase, mantendo a pasta de data. */
export async function atualizarRegistroFirebase(key, dados, dataISO) {
    if (!key) return;
    const data = dataISO || (dados && dados.criadoEm ? dataLocalISO(dados.criadoEm) : dataHojeISO());
    const { id, ...resto } = dados;
    await update(ref(rtdb, caminhoRegistro(key, data)), { ...resto, syncAt: Date.now() });
}

/** Remove um registro do Firebase na pasta de data correta. */
export async function removerRegistroFirebase(key, dataISO) {
    if (!key) return;
    const data = dataISO || dataHojeISO();
    await remove(ref(rtdb, caminhoRegistro(key, data)));
}

/**
 * Mescla a lista remota de registros no IndexedDB local.
 * - Adiciona registros novos (criados em outros dispositivos).
 * - Atualiza registros existentes quando a versão remota for mais recente.
 * - Quando `dataISO` é informada, remove localmente apenas os registros dessa
 *   data cuja fbKey sumiu do remoto (excluídos em outro dispositivo). Assim o
 *   ouvinte do dia não apaga registros de outras datas que não estão no snapshot.
 */
export async function mesclarRegistrosRemotos(remotos, dataISO = null) {
    const locais = await db.PPL_Historico.toArray();
    const porFbKey = new Map();
    locais.forEach((r) => {
        if (r.fbKey) porFbKey.set(r.fbKey, r);
    });
    const remoteKeys = new Set(remotos.map((r) => r.fbKey).filter(Boolean));

    await db.transaction('rw', db.PPL_Historico, async () => {
        for (const rem of remotos) {
            if (!rem.fbKey) continue;
            const local = porFbKey.get(rem.fbKey);
            if (local) {
                if ((rem.syncAt || 0) > (local.syncAt || 0)) {
                    const { id: _drop, ...resto } = rem;
                    await db.PPL_Historico.update(local.id, { ...resto, id: local.id });
                }
            } else {
                const { id: _drop, ...resto } = rem;
                await db.PPL_Historico.add(resto);
            }
        }
        // Só remove registros da data informada que sumiram do remoto
        if (dataISO) {
            for (const r of locais) {
                if (r.fbKey && dataLocalISO(r.criadoEm) === dataISO && !remoteKeys.has(r.fbKey)) {
                    await db.PPL_Historico.delete(r.id);
                }
            }
        }
    });
}

/** Busca única (sem listener) de todos os registros de uma pasta de data. */
export async function buscarRegistrosFirebasePorData(dataISO) {
    const snap = await get(ref(rtdb, `registros/${dataISO}`));
    const val = snap.val() || {};
    return Object.entries(val).map(([k, v]) => ({ ...v, fbKey: k }));
}

/**
 * Sincroniza um período: percorre cada dia entre dataInicio e dataFim
 * (YYYY-MM-DD), busca a pasta correspondente no Firebase e mescla no local.
 * Usado pela tela de histórico quando o usuário seleciona um período diferente
 * do dia atual.
 */
export async function sincronizarPeriodoFirebase(inicio, fim) {
    if (!inicio || !fim) return;
    const datas = [];
    const cur = new Date(inicio + 'T00:00:00');
    const end = new Date(fim + 'T00:00:00');
    if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return;
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        datas.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
    }
    for (const data of datas) {
        try {
            const lista = await buscarRegistrosFirebasePorData(data);
            if (lista.length) await mesclarRegistrosRemotos(lista, data);
        } catch (e) {
            console.warn('Sincronização período Firebase', data, e?.message || e);
        }
    }
}

/**
 * Envia para o Firebase todos os registros locais que ainda não têm fbKey
 * (criados offline antes da sincronização ou durante uma queda de conexão).
 */
export async function backfillRegistrosLocais() {
    const semFbKey = await db.PPL_Historico.filter((r) => !r.fbKey).toArray();
    for (const r of semFbKey) {
        try {
            const key = gerarChave('registros');
            await db.PPL_Historico.update(r.id, { fbKey: key });
            const data = dataLocalISO(r.criadoEm) || dataHojeISO();
            const { id, ...resto } = r;
            await set(ref(rtdb, caminhoRegistro(key, data)), { ...resto, fbKey: key, syncAt: Date.now() });
        } catch (e) {
            // silencioso: tentaremos novamente na próxima inicialização
            console.warn('Backfill Firebase falhou para registro', r.id, e);
        }
    }
}

// ─── Base de PPL (PPL_Base) ────────────────────────────────────────────────
/** Substitui integralmente a base de PPL no Firebase (após importação CSV). */
export async function sincronizarPplBaseFirebase(rows) {
    // Usa chaves estáveis por prontuario+nomeVisita para evitar duplicação
    const payload = {};
    rows.forEach((r) => {
        const chave = `${r.prontuario}__${r.nomeVisita || '_semvisita_'}`;
        payload[chave] = { ...r, syncAt: Date.now() };
    });
    await set(ref(rtdb, 'ppl_base'), payload);
}

/**
 * Mescla a base remota no local. Só substitui o local se o remoto tiver dados
 * e o local estiver vazio (evita apagar uma base recém-importada neste dispositivo).
 */
export async function mesclarPplBaseRemoto(remoto) {
    const totalLocal = await db.PPL_Base.count();
    if (totalLocal > 0) return; // este dispositivo já tem base; não sobrescreve
    const entradas = Object.entries(remoto || {});
    if (entradas.length === 0) return;
    const rows = entradas.map(([, v]) => {
        const { syncAt, ...resto } = v;
        return resto;
    });
    await db.transaction('rw', db.PPL_Base, async () => {
        await db.PPL_Base.clear();
        await db.PPL_Base.bulkAdd(rows);
    });
}

// ─── Bloqueios disciplinares (PPL_Bloqueios) ───────────────────────────────
/** Envia/atualiza um bloqueio no Firebase em bloqueios/{id}. */
export async function salvarBloqueioFirebase(bloqueio) {
    if (!bloqueio || !bloqueio.id) return;
    const { id, ...resto } = bloqueio;
    await set(ref(rtdb, `bloqueios/${id}`), { ...resto, syncAt: Date.now() });
}

/** Remove um bloqueio do Firebase. */
export async function removerBloqueioFirebase(id) {
    if (!id) return;
    await remove(ref(rtdb, `bloqueios/${id}`));
}

/** Mescla a lista remota de bloqueios no IndexedDB local. */
export async function mesclarBloqueiosRemotos(remotos) {
    const entradas = Object.entries(remotos || {});
    if (entradas.length === 0) return;
    await db.transaction('rw', db.PPL_Bloqueios, async () => {
        for (const [id, v] of entradas) {
            const { syncAt, ...resto } = v;
            const existente = await db.PPL_Bloqueios.get(Number(id));
            if (existente) {
                if ((v.syncAt || 0) > (existente.syncAt || 0)) {
                    await db.PPL_Bloqueios.update(existente.id, { ...resto, id: existente.id });
                }
            } else {
                await db.PPL_Bloqueios.add({ ...resto, id: Number(id) });
            }
        }
    });
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firebase-bloqueios-sync'));
    }
}

// ─── Configurações globais (app_settings) ──────────────────────────────────
// Nó central /settings no Firebase com:
//   config:   { alasTriagem, alasCastigo, intervaloVestuario, brasaoImpressao, ... }
//   catalogo: [ { id, categoria, nome, ativo }, ... ]
//   syncAt:   timestamp da última gravação
// Credenciais admin NÃO são sincronizadas (ficam apenas no dispositivo).
const SETTINGS_PATH = 'settings';
const SETTINGS_SYNC_KEY = '__settingsSyncAt';

/** Lê a tabela local `config` (exceto admin) e envia para /settings/config. */
export async function sincronizarConfigFirebase() {
    const rows = await db.config.toArray();
    const configObj = {};
    rows.forEach((r) => {
        if (r.chave !== 'admin' && r.chave !== SETTINGS_SYNC_KEY) {
            configObj[r.chave] = r.valor;
        }
    });
    const snap = await get(ref(rtdb, SETTINGS_PATH));
    const atual = snap.val() || {};
    await set(ref(rtdb, SETTINGS_PATH), {
        ...atual,
        config: configObj,
        syncAt: Date.now(),
    });
}

/** Lê o catálogo local (db.itens) e envia para /settings/catalogo. */
export async function sincronizarCatalogoFirebase() {
    const itens = await db.itens.toArray();
    const snap = await get(ref(rtdb, SETTINGS_PATH));
    const atual = snap.val() || {};
    await set(ref(rtdb, SETTINGS_PATH), {
        ...atual,
        catalogo: itens,
        syncAt: Date.now(),
    });
}

/**
 * Envia config + catálogo juntos para /settings. Usado pelo botão
 * "SALVAR CONFIGURAÇÕES" para publicar tudo de uma vez no Firebase.
 */
export async function salvarSettingsFirebase() {
    const rows = await db.config.toArray();
    const configObj = {};
    rows.forEach((r) => {
        if (r.chave !== 'admin' && r.chave !== SETTINGS_SYNC_KEY) {
            configObj[r.chave] = r.valor;
        }
    });
    const itens = await db.itens.toArray();
    await set(ref(rtdb, SETTINGS_PATH), {
        config: configObj,
        catalogo: itens,
        syncAt: Date.now(),
    });
}

/**
 * Mescla as configurações remotas no IndexedDB local. Só aplica quando o
 * syncAt remoto é mais recente que o último aplicado neste dispositivo,
 * evitando loops e sobrescrita de uma edição local recém-feita.
 * Emite um evento global `firebase-settings-sync` para que as telas
 * (Configurações, Registro) recarreguem catálogo/regras instantaneamente.
 */
export async function mesclarSettingsRemoto(remoto) {
    if (!remoto) return;
    const remoteSyncAt = remoto.syncAt || 0;
    const localSyncRow = await db.config.get(SETTINGS_SYNC_KEY);
    const localSyncAt = (localSyncRow && localSyncRow.valor) || 0;
    if (remoteSyncAt < localSyncAt) return; // remoto mais antigo — ignora

    await db.transaction('rw', db.config, db.itens, async () => {
        if (remoto.config && typeof remoto.config === 'object') {
            for (const [chave, valor] of Object.entries(remoto.config)) {
                if (chave === 'admin' || chave === SETTINGS_SYNC_KEY) continue;
                await db.config.put({ chave, valor });
            }
        }
        if (Array.isArray(remoto.catalogo)) {
            await db.itens.clear();
            if (remoto.catalogo.length) await db.itens.bulkAdd(remoto.catalogo);
        }
        await db.config.put({ chave: SETTINGS_SYNC_KEY, valor: remoteSyncAt });
    });

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firebase-settings-sync', { detail: { syncAt: remoteSyncAt } }));
    }
}

/** Backfill: se o Firebase ainda não tem /settings, publica as configurações locais. */
export async function backfillSettingsLocal() {
    const snap = await get(ref(rtdb, SETTINGS_PATH));
    const val = snap.val();
    if (val && val.syncAt) return; // já existe settings remoto
    await salvarSettingsFirebase().catch((e) => console.warn('Backfill settings Firebase:', e));
}

// ─── Inicialização global (chamar uma vez no App) ──────────────────────────
let inicializado = false;

/**
 * Inicializa a sincronização em tempo real:
 *  1. Envia registros locais sem fbKey para o Firebase (backfill offline).
 *  2. Abre ouvinte onValue() em /registros/{DATA_ATUAL} e /ppl_base.
 *  3. Mescla mudanças remotas no IndexedDB — a UI reativa se atualiza sozinha.
 * Retorna função de cancelamento.
 */
export function inicializarSincronizacao() {
    if (inicializado) return () => {};
    inicializado = true;

    // Backfill de registros criados offline
    backfillRegistrosLocais().catch((e) => console.warn('Backfill inicial Firebase:', e));

    // Backfill de configurações: publica as locais se o Firebase ainda não tem /settings
    backfillSettingsLocal().catch((e) => console.warn('Backfill settings inicial:', e));

    // Ouvinte de registros de entrega — apenas a pasta da data atual,
    // evitando carregar todo o histórico e travar o painel em tempo real.
    const dataHoje = dataHojeISO();
    const unsubRegistros = onValue(
        ref(rtdb, `registros/${dataHoje}`),
        (snap) => {
            ouvinteAtivo = true;
            emitStatus();
            const val = snap.val() || {};
            const lista = Object.entries(val).map(([k, v]) => ({ ...v, fbKey: k }));
            mesclarRegistrosRemotos(lista, dataHoje).catch((e) =>
                console.warn('Merge registros Firebase:', e),
            );
        },
        (err) => {
            console.warn('Ouvinte Firebase /registros:', err?.message || err);
            ouvinteAtivo = false;
            emitStatus();
        },
    );

    // Ouvinte da base de PPL
    const unsubPplBase = onValue(
        ref(rtdb, 'ppl_base'),
        (snap) => {
            const val = snap.val();
            if (val) mesclarPplBaseRemoto(val).catch((e) => console.warn('Merge ppl_base Firebase:', e));
        },
        (err) => {
            console.warn('Ouvinte Firebase /ppl_base:', err?.message || err);
        },
    );

    // Ouvinte de bloqueios disciplinares
    const unsubBloqueios = onValue(
        ref(rtdb, 'bloqueios'),
        (snap) => {
            const val = snap.val();
            if (val) mesclarBloqueiosRemotos(val).catch((e) => console.warn('Merge bloqueios Firebase:', e));
        },
        (err) => {
            console.warn('Ouvinte Firebase /bloqueios:', err?.message || err);
        },
    );

    // Ouvinte de configurações globais (/settings) — catálogo, alas e prazos.
    // Quando outro dispositivo salva, este recebe a atualização e mescla no
    // IndexedDB; o evento `firebase-settings-sync` avisa as telas para recarregar.
    const unsubSettings = onValue(
        ref(rtdb, SETTINGS_PATH),
        (snap) => {
            const val = snap.val();
            if (val) mesclarSettingsRemoto(val).catch((e) => console.warn('Merge settings Firebase:', e));
        },
        (err) => {
            console.warn('Ouvinte Firebase /settings:', err?.message || err);
        },
    );

    return () => {
        unsubRegistros();
        unsubPplBase();
        unsubBloqueios();
        unsubSettings();
        inicializado = false;
        ouvinteAtivo = false;
        emitStatus();
    };
}

export { serverTimestamp };
