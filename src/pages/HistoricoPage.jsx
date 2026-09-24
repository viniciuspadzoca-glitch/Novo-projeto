import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { FileText, Pencil, Printer, Trash2, CalendarDays } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { liveQuery } from 'dexie';
import Comprovante from '@/components/Comprovante';
import { db } from '@/lib/db';
import { formatarDataHora } from '@/lib/regras';
import {
    atualizarRegistroFirebase,
    removerRegistroFirebase,
    sincronizarPeriodoFirebase,
} from '@/lib/firebase';

/** Retorna a data (YYYY-MM-DD) no fuso America/Sao_Paulo de um ISO. */
function dataLocalISO(iso) {
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

export default function HistoricoPage() {
    const [registros, setRegistros] = useState([]);
    const [termo, setTermo] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('TODOS');
    const [edicao, setEdicao] = useState(null);
    const [paraImprimir, setParaImprimir] = useState(null);
    const [carregando, setCarregando] = useState(true);

    // Data atual no fuso America/Sao_Paulo (YYYY-MM-DD)
    const hojeISO = dataLocalISO(new Date().toISOString());

    // Carregamento reativo (liveQuery) — atualiza sozinho quando um novo
    // registro é salvo em PPL_Historico, mesmo a partir de outra aba/rota.
    useEffect(() => {
        const sub = liveQuery(() => db.PPL_Historico.toArray()).subscribe((lista) => {
            lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
            setRegistros(lista);
            setCarregando(false);
        });
        return () => sub.unsubscribe();
    }, []);

    // Filtro padrão ao abrir a tela: data atual (Hoje)
    useEffect(() => {
        setDataInicio(hojeISO);
        setDataFim(hojeISO);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Quando o período selecionado difere do dia atual, busca as pastas de data
    // correspondentes no Firebase e mescla no IndexedDB para exibição. O dia
    // atual continua sendo atualizado em tempo real pelo ouvinte global.
    useEffect(() => {
        if (!dataInicio || !dataFim) return;
        if (dataInicio === hojeISO && dataFim === hojeISO) return; // hoje já vem do listener
        sincronizarPeriodoFirebase(dataInicio, dataFim).catch((e) =>
            console.warn('Sincronização de período Firebase falhou:', e?.message || e),
        );
    }, [dataInicio, dataFim, hojeISO]);

    const filtrados = useMemo(() => {
        const t = termo.trim().toLowerCase();
        return registros.filter((r) => {
            if (filtroTipo !== 'TODOS' && r.tipo !== filtroTipo) return false;
            const d = dataLocalISO(r.criadoEm);
            if (dataInicio && d < dataInicio) return false;
            if (dataFim && d > dataFim) return false;
            if (!t) return true;
            return (
                String(r.prontuario).toLowerCase().includes(t) ||
                String(r.ppl?.nome || '').toLowerCase().includes(t)
            );
        });
    }, [registros, termo, filtroTipo, dataInicio, dataFim]);

    const metricas = useMemo(() => {
        const sacolas = filtrados.filter((r) => r.tipo === 'SACOLA').length;
        const sedex = filtrados.filter((r) => r.tipo === 'SEDEX').length;
        return { sacolas, sedex, total: sacolas + sedex };
    }, [filtrados]);

    const ehHoje = dataInicio === hojeISO && dataFim === hojeISO;

    const periodoLabel = useMemo(() => {
        const fmt = (d) => {
            if (!d) return '—';
            const [y, m, dd] = d.split('-');
            return `${dd}/${m}/${y}`;
        };
        if (ehHoje) return 'Hoje';
        if (!dataInicio && !dataFim) return 'Todo o período';
        if (dataInicio && dataFim && dataInicio !== dataFim) return `${fmt(dataInicio)} a ${fmt(dataFim)}`;
        return fmt(dataInicio || dataFim);
    }, [dataInicio, dataFim, ehHoje]);

    const verHoje = () => {
        setDataInicio(hojeISO);
        setDataFim(hojeISO);
    };

    const excluir = async (r) => {
        await db.PPL_Historico.delete(r.id);
        // Reflete a exclusão em todos os dispositivos via Firebase (pasta da data)
        removerRegistroFirebase(r.fbKey, dataLocalISO(r.criadoEm)).catch((e) =>
            console.warn('Exclusão Firebase falhou (removido localmente):', e?.message || e),
        );
    };

    // Abre o modal de edição carregando o CATÁLOGO COMPLETO de itens ativos
    // (Alimentação, Higiene e Vestuário) e pré-preenchendo as quantidades do
    // registro selecionado. Itens não incluídos originalmente aparecem com
    // quantidade 0, prontos para serem adicionados pelo operador.
    const abrirEdicao = async (r) => {
        const catalogo = await db.itens.where('ativo').equals(1).toArray();
        // Mapa das quantidades já lançadas, chaveado por "categoria|nome".
        const lancados = {};
        (r.itens || []).forEach((i) => {
            lancados[`${i.categoria}|${i.nome}`] = Number(i.quantidade) || 0;
        });
        // Mescla catálogo completo + itens do registro (caso algum item do
        // registro não exista mais no catálogo, ele é preservado).
        const porChave = new Map();
        catalogo.forEach((c) => {
            const chave = `${c.categoria}|${c.nome}`;
            porChave.set(chave, {
                nome: c.nome,
                categoria: c.categoria,
                quantidade: lancados[chave] ?? 0,
            });
        });
        (r.itens || []).forEach((i) => {
            const chave = `${i.categoria}|${i.nome}`;
            if (!porChave.has(chave)) {
                porChave.set(chave, {
                    nome: i.nome,
                    categoria: i.categoria,
                    quantidade: Number(i.quantidade) || 0,
                });
            }
        });
        // Ordena por categoria (Alimentação, Higiene, Vestuário) e depois nome.
        const ordemCategorias = ['Alimentação', 'Higiene', 'Vestuário'];
        const itensCompletos = Array.from(porChave.values()).sort((a, b) => {
            const ca = ordemCategorias.indexOf(a.categoria);
            const cb = ordemCategorias.indexOf(b.categoria);
            if (ca !== cb) return ca - cb;
            return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        });
        setEdicao({
            ...r,
            itens: itensCompletos,
            observacoes: { ...(r.observacoes || {}) },
        });
    };

    const salvarEdicao = async () => {
        const itens = edicao.itens
            .filter((i) => Number(i.quantidade) > 0)
            .map((i) => ({
                nome: i.nome,
                categoria: i.categoria,
                quantidade: Number(i.quantidade),
            }));
        await db.PPL_Historico.update(edicao.id, {
            itens,
            observacoes: edicao.observacoes,
            tipo: edicao.tipo,
        });
        // Propaga a edição em tempo real para todos os dispositivos (pasta da data)
        atualizarRegistroFirebase(
            edicao.fbKey,
            {
                itens,
                observacoes: edicao.observacoes,
                tipo: edicao.tipo,
            },
            dataLocalISO(edicao.criadoEm),
        ).catch((e) =>
            console.warn('Edição Firebase falhou (atualizado localmente):', e?.message || e),
        );
        setEdicao(null);
    };

    const imprimir = (r) => {
        setParaImprimir(r);
        setTimeout(() => window.print(), 80);
    };

    const exportarPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        // Cabeçalho
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE ENTREGAS — SACOLAS E SEDEX', 14, 14);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Complexo Penitenciário', 14, 20);
        doc.text(`Período: ${periodoLabel}`, 14, 26);
        doc.text(`Gerado em: ${now}`, 14, 32);

        // Resumo
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO', 14, 42);
        autoTable(doc, {
            startY: 44,
            head: [['Total de Sacolas', 'Total de Sedex', 'Total Geral']],
            body: [[String(metricas.sacolas), String(metricas.sedex), String(metricas.total)]],
            theme: 'grid',
            headStyles: { fillColor: [15, 34, 50], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { halign: 'center', fontSize: 11, fontStyle: 'bold' },
            columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
            margin: { left: 14, right: 14 },
        });

        // Tabela de registros
        const corpo = filtrados.map((r) => [
            formatarDataHora(r.criadoEm),
            r.tipo || '',
            String(r.prontuario || ''),
            r.ppl?.nome || '',
            String(r.itens?.length || 0),
            r.alaRestrita ? `Forçado (${r.alaRestrita})` : r.forcado ? 'Forçado' : 'Regular',
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 8,
            head: [['Data / Hora', 'Tipo', 'Prontuário', 'Nome', 'Itens', 'Situação']],
            body: corpo.length ? corpo : [['—', '—', '—', 'Nenhum registro no período', '—', '—']],
            theme: 'striped',
            headStyles: { fillColor: [212, 162, 55], textColor: [15, 34, 50], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 1.5 },
            columnStyles: { 0: { cellWidth: 45 }, 3: { cellWidth: 60 } },
            margin: { left: 14, right: 14 },
        });

        doc.save(`relatorio_entregas_${dataLocalISO(new Date().toISOString())}.pdf`);
    };

    const situacaoBadge = (r) => {
        if (r.alaRestrita) {
            return (
                <span className="rounded border border-[#D9381E] bg-[#D9381E]/15 px-2 py-0.5 text-xs font-semibold text-[#D9381E]">
                    Forçado ({r.alaRestrita})
                </span>
            );
        }
        if (r.forcado) {
            return (
                <span className="rounded border border-[#D4A237] bg-[#FFB800]/15 px-2 py-0.5 text-xs font-semibold text-[#0F2232]">
                    Forçado
                </span>
            );
        }
        return (
            <span className="rounded border border-emerald-500 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Regular
            </span>
        );
    };

    return (
        <>
            <Helmet>
                <title>Histórico de Registros — Sistema de registro de sacolas e sedex</title>
                <meta
                    name="description"
                    content="Consulte, edite, reimprima e exporte em PDF o histórico completo de entregas de Sacola e SEDEX registradas na unidade."
                />
            </Helmet>

            <div className="nao-imprimir space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="mr-auto">
                        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Histórico de registros</h1>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-num font-semibold text-foreground">{registros.length}</span> lançamentos
                            armazenados localmente (IndexedDB).
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={exportarPDF}
                        disabled={filtrados.length === 0}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] to-[#E5A700] px-5 text-sm font-bold uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                    >
                        <FileText className="h-4 w-4" /> Exportar para PDF
                    </button>
                </div>

                {/* ── Painel de métricas ── */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {ehHoje ? 'Sacolas do Dia' : 'Total de Sacolas'}
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricas.sacolas}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {ehHoje ? 'Sedex do Dia' : 'Total de Sedex'}
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricas.sedex}</p>
                    </div>
                    <div className="rounded-xl border border-[#D4A237]/60 bg-[#FFB800]/10 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0F2232]/70">
                            {ehHoje ? 'Total Geral do Dia' : 'Total Geral'}
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricas.total}</p>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Estatísticas referentes ao período: <strong className="text-foreground">{periodoLabel}</strong>
                </p>

                {/* ── Filtros ── */}
                <div className="flex flex-wrap flex-col gap-3 rounded-xl border border-border bg-white p-3 shadow-sm sm:flex-row sm:items-center">
                    <input
                        value={termo}
                        onChange={(e) => setTermo(e.target.value)}
                        placeholder="Buscar por prontuário ou nome"
                        className="h-11 w-full max-w-sm rounded border border-border bg-slate-100 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                De
                            </label>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                                className="h-11 rounded border border-border bg-slate-100 px-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                aria-label="Data inicial"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Até
                            </label>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={(e) => setDataFim(e.target.value)}
                                className="h-11 rounded border border-border bg-slate-100 px-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                aria-label="Data final"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={verHoje}
                            className={`flex h-11 items-center gap-1.5 rounded border px-3 text-sm font-semibold ${
                                ehHoje
                                    ? 'border-[#D4A237] bg-[#FFB800] text-[#0F2232]'
                                    : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                            }`}
                            title="Redefinir filtro para o dia atual"
                        >
                            <CalendarDays className="h-4 w-4" /> Hoje
                        </button>
                    </div>
                    <div className="flex gap-1">
                        {['TODOS', 'SACOLA', 'SEDEX'].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setFiltroTipo(t)}
                                className={`min-h-[44px] rounded px-4 text-sm font-semibold ${
                                    filtroTipo === t
                                        ? 'bg-[#FFB800] text-[#0F2232] border border-[#D4A237]'
                                        : 'border border-border bg-card text-muted-foreground hover:bg-secondary'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {carregando ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                ) : filtrados.length === 0 ? (
                    <p className="rounded border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                        Nenhum registro encontrado no período selecionado.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded border border-border bg-card">
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-[11px] uppercase tracking-widest text-secondary-foreground">
                                <tr>
                                    <th className="px-3 py-2">Data / Hora</th>
                                    <th className="px-3 py-2">Tipo</th>
                                    <th className="px-3 py-2">Prontuário</th>
                                    <th className="px-3 py-2">Nome</th>
                                    <th className="px-3 py-2">Itens</th>
                                    <th className="px-3 py-2">Situação</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtrados.map((r) => (
                                    <tr key={r.id} className="hover:bg-muted/60">
                                        <td className="whitespace-nowrap px-3 py-2 font-num text-xs">
                                            {formatarDataHora(r.criadoEm)}
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{r.tipo}</td>
                                        <td className="px-3 py-2 font-num">{r.prontuario}</td>
                                        <td className="px-3 py-2">{r.ppl?.nome}</td>
                                        <td className="px-3 py-2 font-num">{r.itens?.length || 0}</td>
                                        <td className="px-3 py-2">{situacaoBadge(r)}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => imprimir(r)}
                                                    className="grid h-9 w-9 place-items-center rounded border border-border hover:bg-secondary"
                                                    aria-label="Reimprimir comprovante"
                                                >
                                                    <Printer className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => abrirEdicao(r)}
                                                    className="grid h-9 w-9 place-items-center rounded border border-border hover:bg-secondary"
                                                    aria-label="Editar registro"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => excluir(r)}
                                                    className="grid h-9 w-9 place-items-center rounded border border-border text-muted-foreground hover:bg-[#D9381E]/10 hover:text-[#D9381E]"
                                                    aria-label="Excluir registro"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {edicao && (
                <div className="nao-imprimir modal-overlay bg-foreground/50">
                    <div className="modal-container rounded border border-border bg-card p-5">
                        <div className="modal-header">
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                                Editar registro
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {edicao.ppl?.nome} · {formatarDataHora(edicao.criadoEm)}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Catálogo completo carregado — ajuste as quantidades dos itens.
                                Itens com quantidade 0 não são incluídos no lançamento.
                            </p>

                            <div className="mt-3 flex gap-2">
                                {['SACOLA', 'SEDEX'].map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setEdicao((e) => ({ ...e, tipo: t }))}
                                        className={`min-h-[40px] rounded px-4 text-sm font-bold ${
                                            edicao.tipo === t
                                                ? 'bg-primary text-primary-foreground'
                                                : 'border border-border text-muted-foreground'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="modal-body">
                            {['Alimentação', 'Higiene', 'Vestuário'].map((categoria) => {
                                const itensCat = edicao.itens.filter((i) => i.categoria === categoria);
                                if (itensCat.length === 0) return null;
                                return (
                                    <div key={categoria} className="mt-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                                                {categoria}
                                            </h3>
                                            <span className="font-num text-[11px] text-muted-foreground">
                                                {itensCat.length} itens ·
                                            </span>
                                        </div>
                                        <ul className="divide-y divide-border rounded border border-border bg-background">
                                            {itensCat.map((i) => {
                                                const idx = edicao.itens.indexOf(i);
                                                return (
                                                    <li
                                                        key={`${i.categoria}-${i.nome}`}
                                                        className="flex items-center gap-3 px-3 py-1.5"
                                                    >
                                                        <span className="flex-1 text-sm">{i.nome}</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            inputMode="numeric"
                                                            value={i.quantidade}
                                                            onChange={(e) =>
                                                                setEdicao((prev) => {
                                                                    const itens = prev.itens.map((it, j) =>
                                                                        j === idx
                                                                            ? { ...it, quantidade: e.target.value }
                                                                            : it,
                                                                    );
                                                                    return { ...prev, itens };
                                                                })
                                                            }
                                                            className="font-num h-9 w-16 rounded border border-border bg-card text-center text-sm"
                                                        />
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <div className="mt-2">
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                                Observações — {categoria}
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={edicao.observacoes[categoria] || ''}
                                                onChange={(e) =>
                                                    setEdicao((prev) => ({
                                                        ...prev,
                                                        observacoes: {
                                                            ...prev.observacoes,
                                                            [categoria]: e.target.value,
                                                        },
                                                    }))
                                                }
                                                className="w-full resize-none rounded border border-border bg-background p-2 text-sm"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="modal-footer mt-4 flex items-center justify-between gap-3">
                            <span className="font-num text-sm font-semibold text-foreground">
                                Total de itens:{' '}
                                {edicao.itens.filter((i) => Number(i.quantidade) > 0).length}
                            </span>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEdicao(null)}
                                    className="min-h-[44px] rounded border border-border px-5 text-sm font-semibold hover:bg-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={salvarEdicao}
                                    className="min-h-[44px] rounded bg-primary px-5 text-sm font-bold uppercase tracking-wide text-primary-foreground"
                                >
                                    Salvar alterações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Comprovante registro={paraImprimir} />
        </>
    );
}
