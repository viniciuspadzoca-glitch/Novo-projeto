export const TZ = 'America/Sao_Paulo';

const fmtData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

export function formatarData(iso) {
    if (!iso) return '—';
    return fmtData.format(new Date(iso));
}

export function formatarDataHora(iso) {
    if (!iso) return '—';
    return fmtDataHora.format(new Date(iso)) + ' (Brasília)';
}

export function agoraISO() {
    return new Date().toISOString();
}

export function addDias(iso, dias) {
    const d = new Date(iso);
    d.setDate(d.getDate() + dias);
    return d.toISOString();
}

export function addMeses(iso, meses) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + meses);
    return d.toISOString();
}

export function diffDias(iso) {
    return (Date.now() - new Date(iso).getTime()) / 86400000;
}

/** Último registro do tipo para o PPL (registros já ordenados desc ou não). */
export function ultimoRegistroPorTipo(registros, tipo) {
    const lista = registros
        .filter((r) => r.tipo === tipo)
        .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    return lista[0] || null;
}

/** Último registro global (qualquer tipo) — mais recente. */
export function ultimoRegistroGlobal(registros) {
    if (!registros || !registros.length) return null;
    return [...registros].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))[0];
}

/** Trava de 30 dias por tipo. Retorna null se liberado. */
export function travaFrequencia(registros, tipo) {
    const ultimo = ultimoRegistroPorTipo(registros, tipo);
    if (!ultimo) return null;
    if (diffDias(ultimo.criadoEm) >= 30) return null;
    const liberaEm = addDias(ultimo.criadoEm, 30);
    const label = tipo === 'SEDEX' ? 'SEDEX registrado' : 'Sacola registrada';
    const prox = tipo === 'SEDEX' ? 'Próximo envio liberado em' : 'Próxima liberação em';
    return {
        ultimo: ultimo.criadoEm,
        liberaEm,
        mensagem: `${label} há menos de 30 dias. Último registro: ${formatarData(ultimo.criadoEm)}. ${prox}: ${formatarData(liberaEm)}.`,
    };
}

/** Trava unificada (Sacola + Sedex) de 30 dias. Retorna null se liberado. */
export function travaFrequenciaUnificada(registros) {
    const ultimo = ultimoRegistroGlobal(registros);
    if (!ultimo) return null;
    if (diffDias(ultimo.criadoEm) >= 30) return null;
    const liberaEm = addDias(ultimo.criadoEm, 30);
    const dias = Math.floor(diffDias(ultimo.criadoEm));
    return {
        ultimo: ultimo.criadoEm,
        liberaEm,
        tipo: ultimo.tipo,
        diasDecorridos: dias,
        mensagem: `O PPL recebeu uma entrega (${ultimo.tipo}) em ${formatarData(ultimo.criadoEm)} (há ${dias} dia(s)). O prazo regulamentar de 30 dias ainda não expirou.`,
    };
}

/** Mapa nomeItemVestuario -> { ultimo, liberaEm } para itens enviados nos últimos N meses. */
export function travasVestuario(registros, meses = 4) {
    const mesesNum = Number(meses) > 0 ? Number(meses) : 4;
    const mapa = {};
    registros.forEach((r) => {
        (r.itens || []).forEach((it) => {
            if (it.categoria !== 'Vestuário' || !it.quantidade) return;
            const atual = mapa[it.nome];
            if (!atual || new Date(r.criadoEm) > new Date(atual.ultimo)) {
                mapa[it.nome] = { ultimo: r.criadoEm };
            }
        });
    });
    const saida = {};
    Object.entries(mapa).forEach(([nome, { ultimo }]) => {
        const liberaEm = addMeses(ultimo, mesesNum);
        if (Date.now() < new Date(liberaEm).getTime()) {
            saida[nome] = { ultimo, liberaEm };
        }
    });
    return saida;
}

/** Próxima data permitida para entrega de vestuário (data + N meses). */
export function proximaEntregaVestuario(iso, meses = 4) {
    const mesesNum = Number(meses) > 0 ? Number(meses) : 4;
    return addMeses(iso, mesesNum);
}
