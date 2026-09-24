import React from 'react';
import { createPortal } from 'react-dom';
import { getBrasaoImpressao } from '@/lib/config';

const LOGO_URL =
    'https://horizons-cdn.hostinger.com/ff411dd5-b9f8-4710-b3a2-2b05dd6a1cab/0b271747e6833fabbe8f2fcb7e4d6e17.png';

// Emblema PCE SEDEX — usado como brasão padrão (fallback) e marca d'água
const EMBLEMA_URL =
    'https://horizons-cdn.hostinger.com/ff411dd5-b9f8-4710-b3a2-2b05dd6a1cab/dcbda0d428c5847171e4d1505ca40633.png';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatarData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function normalizar(txt) {
    return String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function addMeses(iso, meses) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + meses);
    return d.toISOString();
}

function obsTexto(observacoes) {
    if (!observacoes) return '';
    if (typeof observacoes === 'string') return observacoes;
    return Object.entries(observacoes)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
}

function nomeVisitanteSemRequerente(nome) {
    return String(nome || '')
        .replace(/\s*\(Requerente\)\s*$/i, '')
        .trim();
}

/* ─── Tabela dinâmica por categoria ──────────────────────────────────────── */
function TabelaCategoria({ titulo, itensFiltrados, corFundo }) {
    if (!itensFiltrados || itensFiltrados.length === 0) return null;
    return (
        <table style={{ ...ts.tbl, marginBottom: '1.5mm', fontSize: '7.5pt' }}>
            <thead>
                <tr>
                    <th
                        colSpan={2}
                        style={{
                            ...ts.th,
                            background: corFundo,
                            textAlign: 'center',
                            padding: '0.8mm 1mm',
                            printColorAdjust: 'exact',
                            WebkitPrintColorAdjust: 'exact',
                        }}
                    >
                        {titulo}
                    </th>
                </tr>
                <tr>
                    <th style={{ ...ts.th, width: '76%' }}>Item</th>
                    <th style={{ ...ts.th, width: '24%', textAlign: 'center' }}>Qtde</th>
                </tr>
            </thead>
            <tbody>
                {itensFiltrados.map((item, i) => (
                    <tr
                        key={i}
                        style={{
                            background: i % 2 === 0 ? '#fff' : '#f5f5f5',
                            printColorAdjust: 'exact',
                            WebkitPrintColorAdjust: 'exact',
                        }}
                    >
                        <td style={ts.td}>{item.nome}</td>
                        <td style={{ ...ts.td, textAlign: 'center', fontWeight: 700 }}>{item.quantidade}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function extrairCubiculo(bloco) {
    if (!bloco) return '';
    const partes = String(bloco).trim().split(/[\/\s-]+/);
    const ultimo = partes[partes.length - 1];
    return ultimo && !isNaN(ultimo) ? ultimo : (ultimo || bloco);
}

/* ─── Via única ───────────────────────────────────────────────────────────── */
function Via({ titulo, registro, brasaoUrl }) {
    const { ppl = {}, tipo = 'SACOLA', criadoEm, itens = [], observacoes = {}, id } = registro;
    const cubiculo = extrairCubiculo(ppl?.bloco);
    const mesesVest = Number(registro.intervaloVestuario) > 0 ? Number(registro.intervaloVestuario) : 4;

    const itensFiltrados = (Array.isArray(itens) ? itens : []).filter((i) => Number(i?.quantidade) > 0);
    const porCategoria = (chave) => itensFiltrados.filter((i) => normalizar(i.categoria) === chave);
    const alimentacao = porCategoria('alimentacao');
    const higiene = porCategoria('higiene');
    const vestuario = porCategoria('vestuario');
    const outros = itensFiltrados.filter(
        (i) => !['alimentacao', 'higiene', 'vestuario'].includes(normalizar(i.categoria)),
    );
    const temVest = vestuario.length > 0;
    const obsStr = obsTexto(observacoes);
    const nomeVisitante = nomeVisitanteSemRequerente(ppl?.nomeVisita);
    const dataFormatada = formatarData(criadoEm);

    return (
        <div style={ts.via}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* ── Cabeçalho institucional ── */}
                <table style={{ ...ts.tbl, marginBottom: '1mm' }}>
                    <tbody>
                        <tr>
                            {/* Logo */}
                            <td
                                rowSpan={3}
                                style={{
                                    width: '22mm',
                                    minWidth: '22mm',
                                    border: '1px solid #000',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    padding: '0.5mm',
                                }}
                            >
                                <img
                                    src={brasaoUrl || EMBLEMA_URL}
                                    alt="Brasão Polícia Penal"
                                    style={{
                                        maxWidth: '80px',
                                        maxHeight: '80px',
                                        width: 'auto',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        display: 'block',
                                        margin: 'auto',
                                        printColorAdjust: 'exact',
                                        WebkitPrintColorAdjust: 'exact',
                                    }}
                                />
                            </td>
                            <td
                                style={{
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    fontSize: '7.5pt',
                                    border: '1px solid #000',
                                    padding: '0.4mm 1mm',
                                }}
                            >
                                SECRETARIA DE ESTADO DA SEGURANÇA PÚBLICA E ADMINISTRAÇÃO PENITENCIÁRIA - SESP
                            </td>

                        </tr>
                        <tr>
                            <td
                                style={{
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    fontSize: '7.5pt',
                                    border: '1px solid #000',
                                    padding: '0.3mm 1mm',
                                }}
                            >
                                GESTÃO DE RECEBIMENTO DE ENCOMENDAS PRISIONAIS - COMPLEXO PENITENCIÁRIO
                            </td>
                        </tr>
                        <tr>
                            <td
                                style={{
                                    textAlign: 'center',
                                    fontSize: '8pt',
                                    border: '1px solid #000',
                                    padding: '0.3mm 1mm',
                                    fontWeight: 600,
                                    background: '#1a3a5c',
                                    color: '#fff',
                                    printColorAdjust: 'exact',
                                    WebkitPrintColorAdjust: 'exact',
                                }}
                            >
                                COMPROVANTE DE ENTREGA — SACOLAS E SEDEX &nbsp;|&nbsp; {titulo}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── Grade de dados ── */}
                <table style={{ ...ts.tbl, marginBottom: '1mm', fontSize: '7.5pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ ...ts.th, width: '8%' }}>DATA:</td>
                            <td style={{ ...ts.td, width: '14%' }}>{dataFormatada}</td>
                            <td style={{ ...ts.th, width: '12%' }}>RECIBO Nº:</td>
                            <td style={{ ...ts.td, width: '9%' }}>#{String(id || '').padStart(4, '0')}</td>
                            <td style={{ ...ts.th, width: '8%' }}>CRED.:</td>
                            <td style={{ ...ts.td, width: '12%' }}>{ppl?.credencial || '-'}</td>
                            <td style={{ ...ts.th, width: '18%' }}>SITUAÇÃO CRED.:</td>
                            <td style={ts.td}>Normal</td>
                        </tr>
                        <tr>
                            <td style={{ ...ts.th, width: '10%' }}>PRONT:</td>
                            <td colSpan={5} style={{ ...ts.td, fontWeight: 700, fontSize: '8pt' }}>
                                {ppl?.prontuario || '—'} — {ppl?.nome || '—'}
                            </td>
                            <td colSpan={2} style={{ border: '2px solid #000', padding: '0.5mm 1mm', textAlign: 'center', background: '#000', color: '#fff', fontWeight: 700, fontSize: '10.5pt', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                                CUBÍCULO: {cubiculo || '—'}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ ...ts.th, width: '10%', padding: '0.3mm 0.8mm' }}>VISITANTE:</td>
                            <td
                                colSpan={5}
                                style={{
                                    ...ts.td,
                                    fontWeight: 700,
                                    padding: '0.3mm 0.8mm',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontSize: '7.5pt',
                                }}
                            >
                                {nomeVisitante || '—'}
                            </td>
                            <td style={{ ...ts.th, width: '12%', padding: '0.3mm 0.8mm', whiteSpace: 'nowrap' }}>PARENTESCO:</td>
                            <td
                                style={{
                                    ...ts.td,
                                    fontWeight: 700,
                                    padding: '0.3mm 0.8mm',
                                    whiteSpace: 'nowrap',
                                    fontSize: '7.5pt',
                                }}
                            >
                                {ppl?.grauParentesco || '—'}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── Tabelas de itens ── */}
                <div style={{ display: 'flex', gap: '1.5mm', alignItems: 'flex-start', marginBottom: '1mm', flex: 1 }}>
                    <div style={{ flex: 1 }}>
                        <TabelaCategoria titulo="ALIMENTAÇÃO" itensFiltrados={alimentacao} corFundo="#d5e8d4" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <TabelaCategoria titulo="HIGIENE" itensFiltrados={higiene} corFundo="#dae8fc" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <TabelaCategoria titulo="VESTUÁRIOS" itensFiltrados={vestuario} corFundo="#d0d8e0" />
                        {temVest && (
                            <div
                                style={{
                                    border: '1.5px solid #7b3f00',
                                    padding: '1mm',
                                    fontSize: '7pt',
                                    lineHeight: 1.35,
                                    marginTop: '1mm',
                                    background: '#fffce8',
                                    printColorAdjust: 'exact',
                                    WebkitPrintColorAdjust: 'exact',
                                }}
                            >
                                <div style={{ textAlign: 'center', fontWeight: 700, color: '#7b3f00', fontSize: '7.5pt', marginBottom: '0.4mm' }}>
                                    REGRA EXCLUSIVA DE VESTUÁRIO ({mesesVest} MESES)
                                </div>
                                <div style={{ color: '#000' }}>
                                    Próxima entrega de VESTUÁRIO liberada a partir de: <strong>{formatarData(addMeses(criadoEm, mesesVest))}</strong>. (Avisos de vestuário não afetam as entregas mensais de Alimentação e Higiene).
                                </div>
                            </div>
                        )}
                        <TabelaCategoria titulo="OUTROS" itensFiltrados={outros} corFundo="#e8e8e8" />
                    </div>
                </div>

                {itensFiltrados.length === 0 && (
                    <div style={{ border: '1px solid #000', padding: '1.5mm', fontSize: '7.5pt', marginBottom: '1mm', textAlign: 'center' }}>
                        NENHUM ITEM LANÇADO NESTE ATENDIMENTO.
                    </div>
                )}

                {/* ── Observações ── */}
                <div style={{ border: '1px solid #000', padding: '1mm', fontSize: '8pt', marginBottom: '1mm', minHeight: '6mm' }}>
                    <strong>OBSERVAÇÕES: </strong>{obsStr || ' '}
                </div>

                {/* ── Ciente portaria ── */}
                <div style={{ border: '1px solid #000', padding: '1mm', fontSize: '7.5pt', lineHeight: 1.4, marginBottom: '1.5mm' }}>
                    <em>
                        CIENTE DE QUE A REVISTA DAS SACOLAS SERÁ FEITA POSTERIORMENTE, SENDO QUE, HAVENDO QUANTIDADE DE ITENS
                        SUPERIOR AO PERMITIDO, OS MESMOS SERÃO DESCARTADOS OU DOADOS À INSTITUIÇÕES CONFORME O ART. 3º DA
                        PORTARIA 007/2022.
                    </em>
                </div>

                {/* ── Data e assinaturas ── */}
                <div style={{ fontSize: '8pt', marginBottom: '1mm', fontWeight: 600 }}>
                    {dataFormatada ? `PIRAQUARA-PR, ${dataFormatada}` : 'PIRAQUARA-PR, ____/____/________'}
                </div>
                <div style={{ display: 'flex', gap: '6mm', marginBottom: '1mm' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ height: '9mm' }} />
                        <div style={{ borderTop: '1px solid #000', marginBottom: '1mm' }} />
                        <div style={{ fontSize: '8pt', color: '#000', fontWeight: 600 }}>
                            Assinatura do Visitante / Entregador
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#444' }}>{nomeVisitante}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ height: '9mm' }} />
                        <div style={{ borderTop: '1px solid #000', marginBottom: '1mm' }} />
                        <div style={{ fontSize: '8pt', color: '#000', fontWeight: 600 }}>
                            Assinatura do PPL (Interno)
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#444' }}>{ppl?.nome || ''} — {ppl?.prontuario || ''}</div>
                    </div>
                </div>

                {/* ── Rodapé ── */}
                <div
                    style={{
                        border: '1px solid #000',
                        padding: '0.8mm 1mm',
                        fontSize: '7pt',
                        lineHeight: 1.4,
                        textAlign: 'center',
                        background: '#f0f0f0',
                        printColorAdjust: 'exact',
                        WebkitPrintColorAdjust: 'exact',
                    }}
                >
                    Av. das Palmeiras, s/nº - Complexo Penitenciário - CEP 83.302-240 - Piraquara/PR - Fone (41) 3589-8400
                </div>
            </div>
        </div>
    );
}

/* ─── Inline styles base ─────────────────────────────────────────────────── */
const ts = {
    via: {
        boxSizing: 'border-box',
        width: '50%',
        padding: '2mm 2mm 1.5mm 2mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '8pt',
        color: '#000',
        background: '#fff',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    tbl: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        border: '1px solid #000',
        padding: '0.5mm 0.8mm',
        fontWeight: 700,
        background: '#ebebeb',
        whiteSpace: 'nowrap',
        fontSize: '8pt',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
    },
    td: {
        border: '1px solid #000',
        padding: '0.5mm 0.8mm',
        fontWeight: 400,
        fontSize: '8pt',
    },
};

/* ─── Export ─────────────────────────────────────────────────────────────── */
export default function Comprovante({ registro }) {
    const [pronto, setPronto] = React.useState(false);
    const [brasaoUrl, setBrasaoUrl] = React.useState(null);

    React.useEffect(() => {
        let ativo = true;
        getBrasaoImpressao()
            .then((url) => {
                if (ativo && url) setBrasaoUrl(url);
            })
            .catch(() => {});
        setPronto(true);
        return () => {
            ativo = false;
        };
    }, []);

    if (!registro) return null;

    const seguro = {
        ...registro,
        itens: Array.isArray(registro.itens) ? registro.itens : [],
    };

    const conteudo = (
        <div className="area-impressao">
            <div style={{ display: 'flex', flexDirection: 'row', width: '100%', minHeight: '185mm', alignItems: 'stretch' }}>
                <Via titulo="VIA 1 — SETOR / UNIDADE PRISIONAL" registro={seguro} brasaoUrl={brasaoUrl} />
                {/* Divisor vertical pontilhado */}
                <div style={{ width: '2px', borderLeft: '2px dashed #000', flexShrink: 0, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                <Via titulo="VIA 2 — PPL / INTERNO" registro={seguro} brasaoUrl={brasaoUrl} />
            </div>
        </div>
    );

    if (!pronto || typeof document === 'undefined') return null;
    return createPortal(conteudo, document.body);
}
