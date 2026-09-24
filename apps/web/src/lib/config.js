import { db } from './db';

/**
 * Configurações dinâmicas persistidas no IndexedDB (tabela `config`).
 * Substituem regras fixas (hardcoded) de alas restritas e prazo de vestuário.
 */

const DEFAULTS = {
    alasTriagem: [
        { inicio: 5501, fim: 5510 },
        { inicio: 5601, fim: 5610 },
    ],
    alasCastigo: [
        { inicio: 6501, fim: 6510 },
        { inicio: 6601, fim: 6610 },
    ],
    intervaloVestuario: 4,
    // Brasão padrão da ficha de impressão — emblema PCE SEDEX. Persistido na
    // tabela `config` (IndexedDB) e no Firebase /settings/config pela seed
    // inicial, em vez de ficar nulo e depender apenas do fallback em Comprovante.
    brasaoImpressao:
        'https://horizons-cdn.hostinger.com/ff411dd5-b9f8-4710-b3a2-2b05dd6a1cab/dcbda0d428c5847171e4d1505ca40633.png',
};

export const DEFAULT_CONFIG = DEFAULTS;

export async function getConfig(chave) {
    const r = await db.config.get(chave);
    return r ? r.valor : DEFAULTS[chave];
}

export async function setConfig(chave, valor) {
    await db.config.put({ chave, valor });
}

export async function getAllConfig() {
    const rows = await db.config.toArray();
    const map = {};
    rows.forEach((r) => {
        map[r.chave] = r.valor;
    });
    return { ...DEFAULTS, ...map };
}

export async function getAlasTriagem() {
    return getConfig('alasTriagem');
}

export async function getAlasCastigo() {
    return getConfig('alasCastigo');
}

export async function getIntervaloVestuario() {
    const v = await getConfig('intervaloVestuario');
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : DEFAULTS.intervaloVestuario;
}

/**
 * Retorna a URL/base64 do brasão configurado para a ficha de impressão,
 * ou null quando nenhum brasão personalizado foi enviado.
 */
export async function getBrasaoImpressao() {
    const v = await getConfig('brasaoImpressao');
    return v || null;
}

/**
 * Persiste (ou limpa) o brasão da ficha de impressão. Aceita uma string
 * Data URL (base64) ou null para restaurar o brasão padrão.
 */
export async function setBrasaoImpressao(dataUrl) {
    await setConfig('brasaoImpressao', dataUrl || null);
}

/**
 * Verifica se um cubículo (número ou string numérica) está dentro de
 * alguma faixa cadastrada na lista de alas.
 */
export function cubiculoEmAla(cub, alas) {
    const n = parseInt(String(cub).replace(/\D/g, ''), 10);
    if (isNaN(n)) return false;
    return (alas || []).some((a) => {
        const ini = Number(a.inicio);
        const fim = Number(a.fim);
        return Number.isFinite(ini) && Number.isFinite(fim) && n >= ini && n <= fim;
    });
}

/* ─── Autenticação admin ─────────────────────────────────────────────────── */

async function hashSha256(s) {
    const enc = new TextEncoder().encode(String(s));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Semeia as configurações padrão (alas, intervalo de vestuário e credenciais
 * admin iniciais) na primeira execução. Idempotente.
 */
export async function seedConfig() {
    for (const chave of Object.keys(DEFAULTS)) {
        const r = await db.config.get(chave);
        if (!r) await db.config.put({ chave, valor: DEFAULTS[chave] });
    }
    const admin = await db.config.get('admin');
    if (!admin) {
        const senhaHash = await hashSha256('admin2026');
        await db.config.put({ chave: 'admin', valor: { login: 'admin', senhaHash } });
    }
}

export async function validarAdmin(login, senha) {
    const r = await db.config.get('admin');
    if (!r || !r.valor) return false;
    const cred = r.valor;
    const h = await hashSha256(senha);
    return cred.login === String(login).trim() && cred.senhaHash === h;
}

export async function alterarAdminCredenciais(login, senha) {
    const senhaHash = await hashSha256(senha);
    await db.config.put({ chave: 'admin', valor: { login: String(login).trim(), senhaHash } });
}
