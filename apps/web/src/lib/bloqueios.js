import { db } from './db';
import {
    salvarBloqueioFirebase,
    removerBloqueioFirebase,
} from './firebase';

/**
 * Módulo de Bloqueio Temporário de PPL (sanção disciplinar / motivo administrativo).
 * Persistido no IndexedDB (tabela PPL_Bloqueios) e sincronizado via Firebase.
 *
 * Cada bloqueio contém:
 *  - prontuario, nomePpl, motivo
 *  - meses (duração informada)
 *  - dataInicio (ISO), dataLiberacao (ISO = dataInicio + meses)
 *  - ativo (1 enquanto a data de liberação não expirou)
 */

/** Soma N meses a uma data e retorna ISO (sem hora). */
export function somarMesesDataISO(dataBase, meses) {
    const d = dataBase ? new Date(dataBase) : new Date();
    const n = Number(meses) || 0;
    const dia = d.getDate();
    d.setMonth(d.getMonth() + n);
    // Ajuste de "transbordo" de dia (ex.: 31/jan + 1 mês → 3/mar vira 28/fev)
    if (d.getDate() < dia) d.setDate(0);
    return d.toISOString();
}

/** Retorna a data de hoje em ISO (timezone local America/Sao_Paulo aproximado). */
export function agoraISOBloqueio() {
    return new Date().toISOString();
}

/** Lista todos os bloqueios (ativos e expirados). */
export async function listarBloqueios() {
    const rows = await db.PPL_Bloqueios.toArray();
    return rows.sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
}

/** Lista apenas bloqueios ativos (data de liberação > agora). */
export async function listarBloqueiosAtivos() {
    const agora = Date.now();
    const rows = await db.PPL_Bloqueios.toArray();
    return rows.filter((r) => new Date(r.dataLiberacao).getTime() > agora);
}

/**
 * Busca o bloqueio ativo de um prontuário. Retorna null se não houver.
 * Também marca como inativo (ativo=0) bloqueios já expirados encontrados.
 */
export async function getBloqueioAtivo(prontuario) {
    if (!prontuario) return null;
    const rows = await db.PPL_Bloqueios.where('prontuario').equals(String(prontuario)).toArray();
    const agora = Date.now();
    const ativos = rows.filter((r) => new Date(r.dataLiberacao).getTime() > agora);
    if (ativos.length === 0) return null;
    // ordena pelo que libera mais tarde (bloqueio mais restritivo vigente)
    ativos.sort((a, b) => new Date(b.dataLiberacao) - new Date(a.dataLiberacao));
    return ativos[0];
}

/** Cria um novo bloqueio. */
export async function adicionarBloqueio({ prontuario, nomePpl, meses, motivo }) {
    const mes = Number(meses);
    if (!prontuario || !mes || mes <= 0) {
        throw new Error('Prontuário e tempo de suspensão (meses) são obrigatórios.');
    }
    const dataInicio = agoraISOBloqueio();
    const dataLiberacao = somarMesesDataISO(dataInicio, mes);
    const registro = {
        prontuario: String(prontuario).trim(),
        nomePpl: (nomePpl || '').trim(),
        meses: mes,
        motivo: (motivo || '').trim(),
        dataInicio,
        dataLiberacao,
        ativo: 1,
    };
    const id = await db.PPL_Bloqueios.add(registro);
    salvarBloqueioFirebase({ ...registro, id }).catch((e) =>
        console.warn('Sync Firebase bloqueio (add):', e?.message || e),
    );
    return { ...registro, id };
}

/** Atualiza um bloqueio existente (motivo e/ou duração). Recalcula liberação. */
export async function atualizarBloqueio(id, { meses, motivo }) {
    const atual = await db.PPL_Bloqueios.get(id);
    if (!atual) throw new Error('Bloqueio não encontrado.');
    const patch = {};
    if (motivo !== undefined) patch.motivo = String(motivo).trim();
    if (meses !== undefined) {
        const mes = Number(meses);
        if (mes > 0) {
            patch.meses = mes;
            // Recalcula a liberação a partir da data de início original
            patch.dataLiberacao = somarMesesDataISO(atual.dataInicio, mes);
            patch.ativo = new Date(patch.dataLiberacao).getTime() > Date.now() ? 1 : 0;
        }
    }
    await db.PPL_Bloqueios.update(id, patch);
    const atualizado = { ...atual, ...patch };
    salvarBloqueioFirebase(atualizado).catch((e) =>
        console.warn('Sync Firebase bloqueio (update):', e?.message || e),
    );
    return atualizado;
}

/** Remove (exclui) um bloqueio — libera o PPL antecipadamente. */
export async function removerBloqueio(id) {
    await db.PPL_Bloqueios.delete(id);
    removerBloqueioFirebase(id).catch((e) =>
        console.warn('Sync Firebase bloqueio (remove):', e?.message || e),
    );
}

/** Calcula dias restantes até a liberação (negativo se expirado). */
export function diasRestantes(dataLiberacao) {
    const ms = new Date(dataLiberacao).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
