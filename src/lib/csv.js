function detectarDelimitador(linha) {
    const v = (linha.match(/,/g) || []).length;
    const p = (linha.match(/;/g) || []).length;
    return p > v ? ';' : ',';
}

function dividir(linha, delim) {
    const out = [];
    let atual = '';
    let dentro = false;
    for (let i = 0; i < linha.length; i += 1) {
        const c = linha[i];
        if (c === '"') {
            if (dentro && linha[i + 1] === '"') {
                atual += '"';
                i += 1;
            } else dentro = !dentro;
        } else if (c === delim && !dentro) {
            out.push(atual);
            atual = '';
        } else atual += c;
    }
    out.push(atual);
    return out.map((s) => s.trim().replace(/^"|"$/g, ''));
}

const norm = (s) =>
    s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 _]/g, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Extrai o último segmento numérico de um campo de bloco/galeria/cela.
 * Ex: "BLOCO/ B6-2GALERIA/ 6201" → "6201"
 */
function parsearBloco(raw) {
    if (!raw) return '';
    const partes = String(raw).split(/[\/\s-]+/).map((s) => s.trim()).filter(Boolean);
    const ultimo = partes[partes.length - 1] || '';
    return ultimo || String(raw).trim();
}

/**
 * Mapeia um cabeçalho normalizado para uma chave lógica.
 * Suporta os dois formatos:
 *   - Novo (6 colunas): prontuario, nome_ppl, galeria, cela, familiar, credencial
 *   - Antigo:           Prontuario, Nome do ppl, Cela, Nome da visita/Visitante, Credencial, Afinidade
 */
function mapearColuna(c) {
    if (c === 'prontuario') return 'prontuario';
    if (c === 'nome ppl' || c === 'nome do ppl' || c === 'nome ppl' || c === 'nome') return 'nomePpl';
    if (c === 'galeria') return 'galeria';
    if (c === 'cela' || c === 'cubiculo') return 'cela';
    if (c === 'familiar' || c.includes('nome da visita') || c === 'visitante' || c.includes('nome visita')) return 'nomeVisita';
    if (c === 'credencial') return 'credencial';
    if (c === 'afinidade' || c.includes('parentesco')) return 'afinidade';
    return null;
}

/**
 * Detecta se a primeira linha contém os cabeçalhos do novo formato CSV (6 colunas)
 * ou do formato anterior com pelo menos prontuário + nome + cela.
 */
function detectarFormatoCabecalho(cabecalhoNorm) {
    const chaves = cabecalhoNorm.map(mapearColuna).filter(Boolean);
    const temProntuario = chaves.includes('prontuario');
    const temNome = chaves.includes('nomePpl');
    const temCela = chaves.includes('cela');
    if (temProntuario && temNome && temCela) return 'novo';
    return null;
}

/**
 * Parser CSV para o formato com cabeçalhos explícitos.
 * Colunas suportadas: prontuario, nome_ppl, galeria, cela, familiar, credencial (afinidade opcional).
 *
 * Retorna { linhas: [{prontuario, nome, galeria, cela, bloco}], visitantes: [{prontuario, nomeVisita, credencial, afinidade}], total, ignoradas }
 */
function parseCSVComCabecalho(linhasBruto, delim, cabecalhoNorm) {
    const idx = {};
    cabecalhoNorm.forEach((c, i) => {
        const chave = mapearColuna(c);
        if (chave && idx[chave] === undefined) idx[chave] = i;
    });

    const pplMap = new Map(); // prontuario → { prontuario, nome, galeria, cela, bloco }
    const visitantes = [];
    let ignoradas = 0;

    linhasBruto.forEach((l) => {
        if (!l.trim()) return;
        const cols = dividir(l, delim);
        const prontuario = (cols[idx.prontuario] ?? '').trim();
        const nomePpl = idx.nomePpl !== undefined ? (cols[idx.nomePpl] ?? '').trim() : '';
        const galeria = idx.galeria !== undefined ? (cols[idx.galeria] ?? '').trim() : '';
        const cela = idx.cela !== undefined ? (cols[idx.cela] ?? '').trim() : '';
        const nomeVisita = idx.nomeVisita !== undefined ? (cols[idx.nomeVisita] ?? '').trim() : '';
        const credencial = idx.credencial !== undefined ? (cols[idx.credencial] ?? '').trim() : '';
        const afinidade = idx.afinidade !== undefined ? (cols[idx.afinidade] ?? '').trim() : '';

        if (!prontuario || !nomePpl) { ignoradas += 1; return; }

        if (!pplMap.has(prontuario)) {
            pplMap.set(prontuario, {
                prontuario,
                nome: nomePpl,
                galeria,
                cela,
                bloco: cela || '',
            });
        }

        if (nomeVisita) {
            visitantes.push({ prontuario, nomeVisita, credencial, afinidade });
        }
    });

    return {
        linhas: Array.from(pplMap.values()),
        visitantes,
        total: linhasBruto.length,
        ignoradas,
    };
}

/** Retorna { linhas: [{prontuario, nome, galeria, cela, bloco}], visitantes: [], total, ignoradas } */
export function parsePplCsv(texto) {
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!linhas.length) return { linhas: [], visitantes: [], total: 0, ignoradas: 0 };
    const delim = detectarDelimitador(linhas[0]);
    const cabecalho = dividir(linhas[0], delim);
    const cabecalhoNorm = cabecalho.map(norm);

    // Formato com cabeçalhos explícitos (novo 6 colunas ou anterior)
    if (detectarFormatoCabecalho(cabecalhoNorm)) {
        return parseCSVComCabecalho(linhas.slice(1), delim, cabecalhoNorm);
    }

    // Formato legado (3 colunas sem cabeçalho reconhecido)
    const temCabecalho = cabecalhoNorm.some((c) => ['prontuario', 'nome', 'bloco'].includes(c));
    const idx = {
        prontuario: temCabecalho ? cabecalhoNorm.findIndex((c) => c.startsWith('prontuario')) : 0,
        nome: temCabecalho ? cabecalhoNorm.indexOf('nome') : 1,
        bloco: temCabecalho ? cabecalhoNorm.indexOf('bloco') : 2,
    };
    const dados = temCabecalho ? linhas.slice(1) : linhas;
    const saida = [];
    let ignoradas = 0;
    dados.forEach((l) => {
        const cols = dividir(l, delim);
        let prontuario = (cols[idx.prontuario] || '').trim();
        let nome = (cols[idx.nome] || '').trim();
        let bloco = (cols[idx.bloco] || '').trim();

        const matchEspecifico = prontuario.match(/^(\d+)\s*-\s+(.+)$/);
        if (matchEspecifico) {
            const blocoRaw = nome || (cols[1] || '').trim();
            bloco = parsearBloco(blocoRaw);
            nome = matchEspecifico[2].trim();
            prontuario = matchEspecifico[1].trim();
        } else if (prontuario && !nome) {
            const match = prontuario.match(/^(\d+)\s*[-–—]?\s+(.+)$/);
            if (match) {
                bloco = parsearBloco((cols[1] || '').trim());
                nome = match[2].trim();
                prontuario = match[1].trim();
            }
        } else if (bloco) {
            bloco = parsearBloco(bloco);
        }

        if (!prontuario || !nome) { ignoradas += 1; return; }
        saida.push({ prontuario, nome, galeria: '', cela: bloco, bloco });
    });
    return { linhas: saida, visitantes: [], total: dados.length, ignoradas };
}

export function paraCsv(rows, colunas) {
    const escape = (v) => {
        const s = v === undefined || v === null ? '' : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [colunas.join(';'), ...rows.map((r) => colunas.map((c) => escape(r[c])).join(';'))].join('\n');
}

export function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
}
