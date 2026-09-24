import Dexie from 'dexie';

export const db = new Dexie('jumbo_ppl');

// ---- Versões históricas ----
db.version(1).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
});

db.version(2).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
});

// ---- Versão 3: PPL_Base e PPL_Historico separados ----
db.version(3).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
}).upgrade(async (tx) => {
    // Migrar ppls + visitantes → PPL_Base
    const ppls = await tx.table('ppls').toArray();
    const visitantes = await tx.table('visitantes').toArray();

    const visitMap = {};
    visitantes.forEach((v) => {
        if (!visitMap[v.prontuario]) visitMap[v.prontuario] = [];
        visitMap[v.prontuario].push(v);
    });

    const baseRows = [];
    ppls.forEach((p) => {
        const vs = visitMap[p.prontuario] || [];
        const cela = p.bloco
            ? p.bloco.replace(/^Cubículo\s*/i, '').trim()
            : '';
        if (vs.length === 0) {
            baseRows.push({
                prontuario: p.prontuario,
                nome: p.nome,
                nomePpl: p.nome,
                bloco: p.bloco || '',
                cela,
                nomeVisita: '',
                credencial: '',
                afinidade: '',
            });
        } else {
            vs.forEach((v) => {
                baseRows.push({
                    prontuario: p.prontuario,
                    nome: p.nome,
                    nomePpl: p.nome,
                    bloco: p.bloco || '',
                    cela,
                    nomeVisita: v.nomeVisita || '',
                    credencial: v.credencial || '',
                    afinidade: v.afinidade || '',
                });
            });
        }
    });
    if (baseRows.length > 0) {
        await tx.table('PPL_Base').bulkAdd(baseRows);
    }

    // Migrar registros → PPL_Historico
    const registros = await tx.table('registros').toArray();
    const histRows = registros.map((r) => ({ ...r, data: r.criadoEm }));
    if (histRows.length > 0) {
        await tx.table('PPL_Historico').bulkAdd(histRows);
    }
});

// ---- Versão 4: tabela de configurações dinâmicas (alas restritas, intervalo vestuário, admin) ----
db.version(4).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
    config: 'chave',
});

// ---- Versão 5: bloqueios disciplinares temporários de PPL ----
db.version(5).stores({
    ppls: 'prontuario, nome, bloco, cidade, visita',
    itens: '++id, categoria, nome, ativo',
    registros: '++id, prontuario, tipo, criadoEm',
    visitantes: '++id, prontuario',
    PPL_Base: '++id, prontuario, nome',
    PPL_Historico: '++id, prontuario, tipo, criadoEm, data',
    config: 'chave',
    PPL_Bloqueios: '++id, prontuario, dataLiberacao, ativo',
});

export const CATEGORIAS = ['Alimentação', 'Higiene', 'Vestuário'];

// Catálogo Oficial de Itens (34 itens ativos) — usado na primeira carga,
// reset de fábrica e backfill do Firebase quando não há catálogo salvo.
const CATALOGO_PADRAO = [
    ['Alimentação', [
        'Achocolatado', 'Açúcar', 'Adoçante', 'Barras de chocolate', 'Bolacha',
        'Café Solúvel', 'Doce em barra', 'Doce em pasta', 'Farofa', 'Leite em pó',
        'Macarrão tipo miojo', 'Margarina', 'Pão fatiado', 'Suco em pó',
    ]],
    ['Higiene', [
        'Aparelho de barbear', 'Creme dental', 'Desinfetante', 'Desodorante',
        'Detergente', 'Escova de dentes', 'Esponja dupla face', 'Papel Higiênico',
        'Sabão em barra', 'Sabão em pó', 'Sabonetes', 'Shampoo',
    ]],
    ['Vestuário', [
        'Chinelo', 'Cobertor', 'Cortador de unha pq.', 'Cuecas', 'Escova de roupas',
        'Meias', 'Tênis', 'Toalha br.',
    ]],
];

/**
 * Gera a lista de registros do catálogo padrão (34 itens, todos ativos).
 * Exportado para que a tela de Configurações possa restaurar os padrões.
 */
export function gerarCatalogoPadrao() {
    const rows = [];
    CATALOGO_PADRAO.forEach(([categoria, nomes]) => {
        nomes.forEach((nome) => rows.push({ categoria, nome, ativo: 1 }));
    });
    return rows;
}

/**
 * Semeia o catálogo padrão na primeira execução (quando db.itens está vazio).
 * Idempotente: não sobrescreve um catálogo já cadastrado.
 */
export async function seedCatalogo() {
    const count = await db.itens.count();
    if (count > 0) return;
    await db.itens.bulkAdd(gerarCatalogoPadrao());
}

/**
 * Restaura o Catálogo Oficial de Itens (reset de fábrica): limpa db.itens e
 * reinsera os 34 itens padrão, todos ativos. Retorna a nova lista para que
 * o chamador sincronize imediatamente com o Firebase.
 */
export async function restaurarCatalogoPadrao() {
    const rows = gerarCatalogoPadrao();
    await db.transaction('rw', db.itens, async () => {
        await db.itens.clear();
        await db.itens.bulkAdd(rows);
    });
    return rows;
}

/**
 * Retorna lista de PPLs únicos (por prontuário) da PPL_Base, para busca/autocomplete.
 */
export async function getPplUnicosDaBase() {
    const rows = await db.PPL_Base.toArray();
    const map = new Map();
    rows.forEach((r) => {
        if (!map.has(r.prontuario)) {
            const cela = r.cela || (r.bloco ? r.bloco.replace(/^Cubículo\s*/i, '').trim() : '');
            map.set(r.prontuario, {
                prontuario: r.prontuario,
                nome: r.nomePpl || r.nome || '',
                galeria: r.galeria || '',
                cela,
                bloco: cela || r.bloco || '',
            });
        }
    });
    return Array.from(map.values());
}

/**
 * Retorna visitantes do PPL_Base para um prontuário.
 */
export async function getVisitantesDaBase(prontuario) {
    const rows = await db.PPL_Base.where('prontuario').equals(prontuario).toArray();
    return rows
        .filter((r) => r.nomeVisita)
        .map((r) => ({
            prontuario: r.prontuario,
            nomeVisita: r.nomeVisita,
            credencial: r.credencial || '',
            afinidade: r.afinidade || '',
        }));
}
