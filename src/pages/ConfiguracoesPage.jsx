import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    AlertTriangle,
    Ban,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronUp,
    FileUp,
    Image as ImageIcon,
    Lock,
    LogOut,
    Pencil,
    Plus,
    Power,
    RotateCcw,
    Save,
    Search,
    ShieldAlert,
    Trash2,
    Unlock,
    Upload,
    Users,
    X,
} from 'lucide-react';
import { CATEGORIAS, db, getPplUnicosDaBase, seedCatalogo, restaurarCatalogoPadrao } from '@/lib/db';
import { parsePplCsv } from '@/lib/csv';
import { sincronizarCatalogoFirebase, sincronizarConfigFirebase, salvarSettingsFirebase, sincronizarPplBaseFirebase } from '@/lib/firebase';
import {
    adicionarBloqueio,
    atualizarBloqueio,
    diasRestantes,
    listarBloqueios,
    removerBloqueio,
    somarMesesDataISO,
} from '@/lib/bloqueios';
import {
    getAllConfig,
    getBrasaoImpressao,
    seedConfig,
    setBrasaoImpressao,
    setConfig,
    validarAdmin,
} from '@/lib/config';

/* ─── Componente de faixa de ala (intervalo de cubículos) ─────────────────── */
function FaixaAla({ faixa, onChange, onRemover }) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2">
            <input
                type="number"
                inputMode="numeric"
                value={faixa.inicio}
                onChange={(e) => onChange({ ...faixa, inicio: e.target.value })}
                placeholder="Inicial"
                className="font-num h-10 w-28 rounded border border-border bg-white px-2 text-center text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
            />
            <span className="text-sm font-semibold text-muted-foreground">até</span>
            <input
                type="number"
                inputMode="numeric"
                value={faixa.fim}
                onChange={(e) => onChange({ ...faixa, fim: e.target.value })}
                placeholder="Final"
                className="font-num h-10 w-28 rounded border border-border bg-white px-2 text-center text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
            />
            <button
                type="button"
                onClick={onRemover}
                className="grid h-10 w-10 place-items-center rounded border border-[#D9381E]/60 bg-[#D9381E]/10 text-[#D9381E] hover:bg-[#D9381E]/20"
                aria-label="Remover faixa"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}

function PainelAla({ titulo, descricao, cor, alas, setAlas }) {
    const adicionar = () => setAlas([...alas, { inicio: '', fim: '' }]);

    return (
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <span className={`inline-block h-4 w-4 rounded ${cor}`} />
                <h3 className="font-display text-lg font-bold uppercase tracking-wide">{titulo}</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{descricao}</p>
            <div className="space-y-2">
                {alas.length === 0 && (
                    <p className="rounded border border-dashed border-border bg-slate-50 px-3 py-3 text-sm text-muted-foreground">
                        Nenhuma faixa cadastrada — ala liberada.
                    </p>
                )}
                {alas.map((f, i) => (
                    <FaixaAla
                        key={i}
                        faixa={f}
                        onChange={(nf) => setAlas(alas.map((a, j) => (j === i ? nf : a)))}
                        onRemover={() => setAlas(alas.filter((_, j) => j !== i))}
                    />
                ))}
            </div>
            <button
                type="button"
                onClick={adicionar}
                className="mt-3 flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4A237]/60 bg-[#FFB800]/15 px-4 text-sm font-bold uppercase tracking-wide text-[#0F2232] hover:bg-[#FFB800]/25 active:scale-[0.98]"
            >
                <Plus className="h-4 w-4" /> Adicionar faixa
            </button>
        </div>
    );
}

/* ─── Seção do catálogo integrada ─────────────────────────────────────────── */
function SecaoCatalogo() {
    const [itens, setItens] = useState([]);
    const [novos, setNovos] = useState({});
    const [editando, setEditando] = useState(null);
    const [rascunho, setRascunho] = useState('');
    const [carregando, setCarregando] = useState(true);

    const recarregar = useCallback(async () => {
        const lista = await db.itens.toArray();
        setItens(lista);
        setCarregando(false);
    }, []);

    useEffect(() => {
        seedCatalogo().then(recarregar);
        // Atualiza o catálogo quando outro dispositivo salva configurações no Firebase
        const onSync = () => recarregar();
        window.addEventListener('firebase-settings-sync', onSync);
        return () => window.removeEventListener('firebase-settings-sync', onSync);
    }, [recarregar]);

    const adicionar = async (categoria) => {
        const nome = (novos[categoria] || '').trim();
        if (!nome) return;
        await db.itens.add({ categoria, nome, ativo: 1 });
        setNovos((n) => ({ ...n, [categoria]: '' }));
        recarregar();
        sincronizarCatalogoFirebase().catch((e) => console.warn('Sync catálogo Firebase:', e?.message || e));
    };
    const alternar = async (item) => {
        await db.itens.update(item.id, { ativo: item.ativo === 1 ? 0 : 1 });
        recarregar();
        sincronizarCatalogoFirebase().catch((e) => console.warn('Sync catálogo Firebase:', e?.message || e));
    };
    const excluir = async (item) => {
        await db.itens.delete(item.id);
        recarregar();
        sincronizarCatalogoFirebase().catch((e) => console.warn('Sync catálogo Firebase:', e?.message || e));
    };
    const salvarNome = async (item) => {
        const nome = rascunho.trim();
        if (nome) await db.itens.update(item.id, { nome });
        setEditando(null);
        recarregar();
        sincronizarCatalogoFirebase().catch((e) => console.warn('Sync catálogo Firebase:', e?.message || e));
    };

    // Reset de fábrica: restaura o Catálogo Oficial (34 itens ativos) e
    // sincroniza imediatamente com o Firebase para todos os dispositivos.
    const restaurarPadroes = async () => {
        const ok = window.confirm(
            'Restaurar o Catálogo Oficial de Itens?\n\nIsto substituirá TODOS os itens cadastrados pelos 34 itens padrão (Alimentação, Higiene e Vestuário), todos ativos. Esta ação não pode ser desfeita.',
        );
        if (!ok) return;
        await restaurarCatalogoPadrao();
        await recarregar();
        sincronizarCatalogoFirebase().catch((e) => console.warn('Sync catálogo Firebase:', e?.message || e));
    };

    if (carregando) {
        return (
            <div className="grid gap-4 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-72 animate-pulse rounded border border-border bg-card" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Catálogo Oficial: 34 itens padrão (14 Alimentação · 12 Higiene · 8 Vestuário).
                </p>
                <button
                    type="button"
                    onClick={restaurarPadroes}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4A237]/70 bg-[#D4A237]/10 px-4 text-xs font-bold uppercase tracking-wide text-[#0F2232] transition-all hover:bg-[#D4A237]/20 active:scale-[0.98]"
                >
                    <RotateCcw className="h-4 w-4" /> Restaurar padrões
                </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
            {CATEGORIAS.map((cat) => {
                const lista = itens.filter((i) => i.categoria === cat);
                return (
                    <div key={cat} className="flex flex-col rounded border border-border bg-card">
                        <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2">
                            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-secondary-foreground">
                                {cat}
                            </h2>
                            <span className="font-num text-xs text-muted-foreground">{lista.length} itens</span>
                        </div>
                        <ul className="divide-y divide-border">
                            {lista.length === 0 && (
                                <li className="p-4 text-sm text-muted-foreground">Nenhum item cadastrado.</li>
                            )}
                            {lista.map((item) => (
                                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                    {editando === item.id ? (
                                        <>
                                            <input
                                                autoFocus
                                                value={rascunho}
                                                onChange={(e) => setRascunho(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && salvarNome(item)}
                                                className="h-9 flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => salvarNome(item)}
                                                className="grid h-9 w-9 place-items-center rounded bg-primary text-primary-foreground"
                                                aria-label="Salvar nome"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditando(item.id);
                                                    setRascunho(item.nome);
                                                }}
                                                className={`flex-1 truncate text-left text-sm ${
                                                    item.ativo === 1 ? 'font-medium' : 'text-muted-foreground line-through'
                                                }`}
                                            >
                                                {item.nome}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => alternar(item)}
                                                title={item.ativo === 1 ? 'Inativar item' : 'Reativar item'}
                                                className={`grid h-9 w-9 place-items-center rounded border ${
                                                    item.ativo === 1
                                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                        : 'border-border bg-muted text-muted-foreground'
                                                }`}
                                            >
                                                <Power className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => excluir(item)}
                                                title="Excluir item"
                                                className="grid h-9 w-9 place-items-center rounded border border-border text-muted-foreground hover:bg-[#D9381E]/10 hover:text-[#D9381E]"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-auto flex flex-wrap gap-2 border-t border-border p-3">
                            <input
                                value={novos[cat] || ''}
                                onChange={(e) => setNovos((n) => ({ ...n, [cat]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && adicionar(cat)}
                                placeholder={`Novo item de ${cat}`}
                                className="h-10 min-w-[140px] flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <button
                                type="button"
                                onClick={() => adicionar(cat)}
                                className="flex min-h-[40px] items-center gap-1 rounded bg-primary px-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
                            >
                                <Plus className="h-4 w-4" /> Adicionar
                            </button>
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}

/* ─── Seção de Gestão da Base de PPLs ────────────────────────────────────── */
function SecaoBasePpl() {
    const [ppls, setPpls] = useState([]);
    const [termo, setTermo] = useState('');
    const [arrastando, setArrastando] = useState(false);
    const [status, setStatus] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [pendingFile, setPendingFile] = useState(null);
    const [modalConfirm, setModalConfirm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [rascunho, setRascunho] = useState(null);
    const [excluindo, setExcluindo] = useState(null);
    const [expandido, setExpandido] = useState(false);

    const recarregar = useCallback(async () => {
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
                    visitantes: [],
                });
            }
            if (r.nomeVisita) {
                map.get(r.prontuario).visitantes.push({
                    id: r.id,
                    nomeVisita: r.nomeVisita,
                    credencial: r.credencial || '',
                    afinidade: r.afinidade || '',
                });
            }
        });
        const lista = Array.from(map.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, 'pt-BR'),
        );
        setPpls(lista);
        setCarregando(false);
    }, []);

    useEffect(() => {
        recarregar();
    }, [recarregar]);

    const solicitarImportacao = (file) => {
        if (!file) return;
        setPendingFile(file);
        setModalConfirm(true);
    };

    const confirmarImportacao = async () => {
        setModalConfirm(false);
        const file = pendingFile;
        setPendingFile(null);
        if (!file) return;
        try {
            const texto = await file.text();
            const { linhas, visitantes, ignoradas } = parsePplCsv(texto);
            if (!linhas.length) {
                setStatus({ tipo: 'erro', msg: 'Nenhuma linha válida encontrada no arquivo CSV.' });
                return;
            }
            const visitMap = {};
            (visitantes || []).forEach((v) => {
                if (!visitMap[v.prontuario]) visitMap[v.prontuario] = [];
                visitMap[v.prontuario].push(v);
            });
            const baseRows = [];
            linhas.forEach((l) => {
                const vs = visitMap[l.prontuario] || [];
                const cela = l.cela || (l.bloco ? l.bloco.replace(/^Cubículo\s*/i, '').trim() : '');
                if (vs.length === 0) {
                    baseRows.push({
                        prontuario: l.prontuario,
                        nome: l.nome,
                        nomePpl: l.nome,
                        galeria: l.galeria || '',
                        cela,
                        bloco: cela || l.bloco || '',
                        nomeVisita: '',
                        credencial: '',
                        afinidade: '',
                    });
                } else {
                    vs.forEach((v) => {
                        baseRows.push({
                            prontuario: l.prontuario,
                            nome: l.nome,
                            nomePpl: l.nome,
                            galeria: l.galeria || '',
                            cela,
                            bloco: cela || l.bloco || '',
                            nomeVisita: v.nomeVisita || '',
                            credencial: v.credencial || '',
                            afinidade: v.afinidade || '',
                        });
                    });
                }
            });
            await db.transaction('rw', db.PPL_Base, async () => {
                await db.PPL_Base.clear();
                await db.PPL_Base.bulkAdd(baseRows);
            });
            sincronizarPplBaseFirebase(baseRows).catch((e) =>
                console.warn('Sincronização da base Firebase falhou:', e?.message || e),
            );
            await recarregar();
            const visitantesMsg = visitantes && visitantes.length > 0
                ? ` | ${visitantes.length} visitantes importados`
                : '';
            setStatus({
                tipo: 'ok',
                msg: `Base atualizada: ${linhas.length} PPLs, ${baseRows.length} registros${
                    ignoradas ? `, ${ignoradas} linhas ignoradas` : ''
                }${visitantesMsg}. Histórico preservado intacto.`,
            });
            setTimeout(() => setStatus(null), 5000);
        } catch (e) {
            setStatus({ tipo: 'erro', msg: `Falha ao ler o arquivo: ${e.message}` });
        }
    };

    const abrirEdicao = (p) => {
        setEditando(p.prontuario);
        setRascunho({
            prontuario: p.prontuario,
            nome: p.nome,
            galeria: p.galeria,
            cela: p.cela,
            visitantes: p.visitantes.map((v) => ({ ...v })),
        });
    };

    const atualizarVisitante = (i, campo, valor) => {
        setRascunho((r) => ({
            ...r,
            visitantes: r.visitantes.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)),
        }));
    };

    const adicionarVisitante = () => {
        setRascunho((r) => ({
            ...r,
            visitantes: [...r.visitantes, { id: null, nomeVisita: '', credencial: '', afinidade: '' }],
        }));
    };

    const removerVisitante = (i) => {
        setRascunho((r) => ({ ...r, visitantes: r.visitantes.filter((_, j) => j !== i) }));
    };

    const salvarEdicao = async () => {
        if (!rascunho) return;
        const pront = rascunho.prontuario;
        const rows = await db.PPL_Base.where('prontuario').equals(pront).toArray();
        await db.transaction('rw', db.PPL_Base, async () => {
            // Atualiza campos comuns em todas as linhas existentes
            for (const r of rows) {
                await db.PPL_Base.update(r.id, {
                    nome: rascunho.nome,
                    nomePpl: rascunho.nome,
                    galeria: rascunho.galeria,
                    cela: rascunho.cela,
                    bloco: rascunho.cela,
                });
            }
            // Sincroniza visitantes: atualiza os que têm id, remove os ausentes, adiciona novos
            const idsRascunho = new Set(rascunho.visitantes.map((v) => v.id).filter(Boolean));
            const rowsComVisita = rows.filter((r) => r.nomeVisita);
            for (const r of rowsComVisita) {
                if (!idsRascunho.has(r.id)) {
                    await db.PPL_Base.delete(r.id);
                }
            }
            for (const v of rascunho.visitantes) {
                if (v.id) {
                    await db.PPL_Base.update(v.id, {
                        nomeVisita: v.nomeVisita,
                        credencial: v.credencial,
                        afinidade: v.afinidade,
                        nome: rascunho.nome,
                        nomePpl: rascunho.nome,
                        galeria: rascunho.galeria,
                        cela: rascunho.cela,
                        bloco: rascunho.cela,
                    });
                } else {
                    await db.PPL_Base.add({
                        prontuario: pront,
                        nome: rascunho.nome,
                        nomePpl: rascunho.nome,
                        galeria: rascunho.galeria,
                        cela: rascunho.cela,
                        bloco: rascunho.cela,
                        nomeVisita: v.nomeVisita,
                        credencial: v.credencial,
                        afinidade: v.afinidade,
                    });
                }
            }
        });
        const allRows = await db.PPL_Base.toArray();
        sincronizarPplBaseFirebase(allRows).catch((e) =>
            console.warn('Sync Firebase edição:', e?.message || e),
        );
        setEditando(null);
        setRascunho(null);
        setStatus({ tipo: 'ok', msg: `PPL ${pront} atualizado e sincronizado.` });
        setTimeout(() => setStatus(null), 3500);
        recarregar();
    };

    const confirmarExclusao = async () => {
        const alvo = excluindo;
        setExcluindo(null);
        if (!alvo) return;
        await db.PPL_Base.where('prontuario').equals(alvo.prontuario).delete();
        const allRows = await db.PPL_Base.toArray();
        sincronizarPplBaseFirebase(allRows).catch((e) =>
            console.warn('Sync Firebase exclusão:', e?.message || e),
        );
        setStatus({ tipo: 'ok', msg: `PPL ${alvo.nome} (${alvo.prontuario}) removido da base.` });
        setTimeout(() => setStatus(null), 3500);
        recarregar();
    };

    const filtrados = useMemo(() => {
        const t = termo.trim().toLowerCase();
        if (!t) return ppls.slice(0, 300);
        return ppls
            .filter(
                (p) =>
                    String(p.prontuario).toLowerCase().includes(t) ||
                    String(p.nome).toLowerCase().includes(t),
            )
            .slice(0, 300);
    }, [ppls, termo]);

    return (
        <div className="space-y-4">
            {/* Topo sempre visível: Upload (esquerda) + Resumo com botão (direita) */}
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
                {/* Lado Esquerdo — Upload direto (sempre visível) */}
                <label
                    onDragOver={(e) => {
                        e.preventDefault();
                        setArrastando(true);
                    }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setArrastando(false);
                        solicitarImportacao(e.dataTransfer.files?.[0]);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                        arrastando ? 'border-[#D4A237] bg-[#FFB800]/10' : 'border-border bg-white'
                    }`}
                >
                    <FileUp className="h-8 w-8 text-[#D4A237]" />
                    <p className="font-display text-lg font-bold uppercase tracking-wide">Importar CSV de PPL</p>
                    <p className="max-w-md text-xs text-muted-foreground">
                        Arraste o arquivo aqui ou clique para selecionar. Colunas:{' '}
                        <span className="font-num">prontuario, nome_ppl, galeria, cela, familiar, credencial</span>.
                        A importação substitui a base atual e sincroniza com o Firebase.
                    </p>
                    <input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => solicitarImportacao(e.target.files?.[0])}
                    />
                </label>

                {/* Lado Direito — Resumo + Ação (sempre visível) */}
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#0F2232] text-[#FFB800]">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="font-num text-3xl font-semibold leading-none">
                                {carregando ? '…' : ppls.length}
                            </p>
                            <p className="text-sm text-muted-foreground">PPLs cadastrados na base</p>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        A base é sincronizada automaticamente com o Firebase (<span className="font-num">/ppl_base/</span>),
                        disponível em todos os dispositivos. O histórico de entregas permanece intacto.
                    </p>
                    <button
                        type="button"
                        onClick={() => setExpandido((v) => !v)}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {expandido ? (
                            <>
                                <ChevronUp className="h-4 w-4" /> Recolher
                            </>
                        ) : (
                            <>
                                <ChevronDown className="h-4 w-4" /> Ver / Gerenciar PPLs
                            </>
                        )}
                    </button>
                </div>
            </div>

            {status && (
                <p
                    className={`rounded border-l-4 p-3 text-sm ${
                        status.tipo === 'ok'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-[#D9381E] bg-[#D9381E]/10 text-[#D9381E]'
                    }`}
                >
                    {status.msg}
                </p>
            )}

            {/* Área expansível: somente barra de busca + tabela */}
            {expandido && (
            <div className="rounded-xl border border-border bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
                    <h3 className="font-display text-lg font-bold uppercase tracking-wide">Cadastro de PPL</h3>
                    <div className="relative ml-auto w-full max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={termo}
                            onChange={(e) => setTermo(e.target.value)}
                            placeholder="Filtrar por prontuário ou nome"
                            className="h-10 w-full rounded-lg border border-border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                        />
                    </div>
                </div>

                {carregando ? (
                    <div className="space-y-2 p-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-9 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                ) : filtrados.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        Nenhum PPL na base. Importe um arquivo CSV para começar.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-[11px] uppercase tracking-widest text-secondary-foreground">
                                <tr>
                                    <th className="px-3 py-2">Prontuário</th>
                                    <th className="px-3 py-2">Nome</th>
                                    <th className="px-3 py-2">Galeria</th>
                                    <th className="px-3 py-2">Cubículo</th>
                                    <th className="px-3 py-2">Visitantes</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtrados.map((p) => (
                                    <tr key={p.prontuario} className="hover:bg-muted/60">
                                        <td className="px-3 py-1.5 font-num">{p.prontuario}</td>
                                        <td className="px-3 py-1.5 font-medium">{p.nome}</td>
                                        <td className="px-3 py-1.5">{p.galeria || '—'}</td>
                                        <td className="px-3 py-1.5">{p.cela || p.bloco || '—'}</td>
                                        <td className="px-3 py-1.5">
                                            {p.visitantes.length > 0
                                                ? `${p.visitantes.length} (${p.visitantes[0].nomeVisita}${p.visitantes.length > 1 ? '…' : ''})`
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => abrirEdicao(p)}
                                                    title="Editar PPL"
                                                    className="grid h-8 w-8 place-items-center rounded border border-border text-[#0F2232] hover:bg-[#FFB800]/15"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setExcluindo(p)}
                                                    title="Excluir PPL"
                                                    className="grid h-8 w-8 place-items-center rounded border border-[#D9381E]/60 text-[#D9381E] hover:bg-[#D9381E]/10"
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
            )}

            {/* Modal de confirmação de importação */}
            {modalConfirm && (
                <div className="modal-overlay bg-black/70">
                    <div className="modal-container rounded-xl border border-[#D4A237]/60 bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3">
                            <AlertTriangle className="h-7 w-7 flex-shrink-0 text-[#D9381E]" />
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                Confirmar Importação
                            </h2>
                        </div>
                        <p className="mb-6 text-sm leading-relaxed text-slate-600">
                            A importação <strong>substituirá completamente</strong> a base de PPLs com os dados do novo
                            arquivo CSV e sincronizará com o Firebase.
                            <br /><br />
                            <span className="font-semibold text-emerald-600">
                                Todo o histórico de registros e fichas impressas será mantido intacto.
                            </span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => { setModalConfirm(false); setPendingFile(null); }}
                                className="min-h-[44px] rounded border border-slate-300 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarImportacao}
                                className="min-h-[44px] rounded bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 text-sm font-bold uppercase tracking-wide text-[#0F2232] shadow-lg shadow-[#FFB800]/30 active:scale-[0.98]"
                            >
                                Sim, Importar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de edição individual */}
            {editando && rascunho && (
                <div className="modal-overlay bg-black/70">
                    <div className="modal-container rounded-xl border border-[#D4A237]/60 bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                Editar PPL — {editando}
                            </h2>
                            <button
                                type="button"
                                onClick={() => { setEditando(null); setRascunho(null); }}
                                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"
                                aria-label="Fechar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Nome
                                    </label>
                                    <input
                                        value={rascunho.nome}
                                        onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                                        className="h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Prontuário
                                    </label>
                                    <input
                                        value={rascunho.prontuario}
                                        disabled
                                        className="font-num h-10 w-full rounded-lg border border-border bg-slate-100 px-3 text-sm text-muted-foreground"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Galeria
                                    </label>
                                    <input
                                        value={rascunho.galeria}
                                        onChange={(e) => setRascunho({ ...rascunho, galeria: e.target.value })}
                                        className="h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Cubículo
                                    </label>
                                    <input
                                        value={rascunho.cela}
                                        onChange={(e) => setRascunho({ ...rascunho, cela: e.target.value })}
                                        className="font-num h-10 w-full rounded-lg border border-border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg border border-border bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Visitantes
                                    </p>
                                    <button
                                        type="button"
                                        onClick={adicionarVisitante}
                                        className="flex h-8 items-center gap-1 rounded border border-[#D4A237]/60 bg-[#FFB800]/15 px-2 text-xs font-bold uppercase tracking-wide text-[#0F2232] hover:bg-[#FFB800]/25"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Adicionar
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {rascunho.visitantes.length === 0 && (
                                        <p className="text-xs text-muted-foreground">Nenhum visitante cadastrado.</p>
                                    )}
                                    {rascunho.visitantes.map((v, i) => (
                                        <div key={i} className="flex flex-wrap items-center gap-2">
                                            <input
                                                value={v.nomeVisita}
                                                onChange={(e) => atualizarVisitante(i, 'nomeVisita', e.target.value)}
                                                placeholder="Nome do visitante"
                                                className="h-9 min-w-[140px] flex-1 rounded border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                            />
                                            <input
                                                value={v.credencial}
                                                onChange={(e) => atualizarVisitante(i, 'credencial', e.target.value)}
                                                placeholder="Credencial"
                                                className="font-num h-9 w-28 rounded border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                            />
                                            <input
                                                value={v.afinidade}
                                                onChange={(e) => atualizarVisitante(i, 'afinidade', e.target.value)}
                                                placeholder="Parentesco"
                                                className="h-9 w-28 rounded border border-border bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removerVisitante(i)}
                                                className="grid h-9 w-9 place-items-center rounded border border-[#D9381E]/60 text-[#D9381E] hover:bg-[#D9381E]/10"
                                                aria-label="Remover visitante"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => { setEditando(null); setRascunho(null); }}
                                className="min-h-[44px] rounded border border-slate-300 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={salvarEdicao}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 text-sm font-bold uppercase tracking-wide text-[#0F2232] shadow-lg shadow-[#FFB800]/30 active:scale-[0.98]"
                            >
                                <Save className="h-4 w-4" /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmação de exclusão */}
            {excluindo && (
                <div className="modal-overlay bg-black/70">
                    <div className="modal-container rounded-xl border border-[#D9381E]/60 bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3">
                            <AlertTriangle className="h-7 w-7 flex-shrink-0 text-[#D9381E]" />
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                Excluir PPL
                            </h2>
                        </div>
                        <p className="mb-6 text-sm leading-relaxed text-slate-600">
                            Confirma a remoção de <strong>{excluindo.nome}</strong> (prontuário{' '}
                            <span className="font-num">{excluindo.prontuario}</span>) da base de PPLs?
                            A alteração será sincronizada com o Firebase. O histórico de entregas não é afetado.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setExcluindo(null)}
                                className="min-h-[44px] rounded border border-slate-300 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarExclusao}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#D9381E] px-5 text-sm font-bold uppercase tracking-wide text-white active:scale-[0.98]"
                            >
                                <Trash2 className="h-4 w-4" /> Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Seção de Bloqueio Temporário de PPL ────────────────────────────────── */
function SecaoBloqueioPpl() {
    const [bloqueios, setBloqueios] = useState([]);
    const [pplsBase, setPplsBase] = useState([]);
    const [carregando, setCarregando] = useState(true);

    // Formulário
    const [prontBusca, setProntBusca] = useState('');
    const [prontSelecionado, setProntSelecionado] = useState(null);
    const [sugestoes, setSugestoes] = useState([]);
    const [mostrarSug, setMostrarSug] = useState(false);
    const [meses, setMeses] = useState(1);
    const [motivo, setMotivo] = useState('');
    const [status, setStatus] = useState(null);

    // Edição
    const [editando, setEditando] = useState(null);
    const [editMeses, setEditMeses] = useState(1);
    const [editMotivo, setEditMotivo] = useState('');

    // Exclusão
    const [excluindo, setExcluindo] = useState(null);

    const recarregar = useCallback(async () => {
        const lista = await listarBloqueios();
        setBloqueios(lista);
        setCarregando(false);
    }, []);

    useEffect(() => {
        recarregar();
        getPplUnicosDaBase().then(setPplsBase).catch(() => setPplsBase([]));
        // Atualiza a tabela quando outro dispositivo altera bloqueios no Firebase
        const onSync = () => recarregar();
        window.addEventListener('firebase-bloqueios-sync', onSync);
        return () => window.removeEventListener('firebase-bloqueios-sync', onSync);
    }, [recarregar]);

    // Autocomplete de prontuário
    useEffect(() => {
        const t = prontBusca.trim().toLowerCase();
        if (!t) {
            setSugestoes([]);
            return;
        }
        const matches = pplsBase
            .filter(
                (p) =>
                    String(p.prontuario).toLowerCase().includes(t) ||
                    String(p.nome).toLowerCase().includes(t),
            )
            .slice(0, 8);
        setSugestoes(matches);
    }, [prontBusca, pplsBase]);

    const selecionarPpl = (p) => {
        setProntSelecionado(p);
        setProntBusca(`${p.prontuario} — ${p.nome}`);
        setMostrarSug(false);
        setSugestoes([]);
    };

    const limparForm = () => {
        setProntBusca('');
        setProntSelecionado(null);
        setSugestoes([]);
        setMeses(1);
        setMotivo('');
    };

    const adicionar = async () => {
        if (!prontSelecionado) {
            setStatus({ tipo: 'erro', msg: 'Selecione um PPL da base pela busca.' });
            return;
        }
        const mes = Number(meses);
        if (!mes || mes <= 0) {
            setStatus({ tipo: 'erro', msg: 'Informe o tempo de suspensão em meses.' });
            return;
        }
        if (!motivo.trim()) {
            setStatus({ tipo: 'erro', msg: 'Informe o motivo do bloqueio.' });
            return;
        }
        try {
            await adicionarBloqueio({
                prontuario: prontSelecionado.prontuario,
                nomePpl: prontSelecionado.nome,
                meses: mes,
                motivo: motivo.trim(),
            });
            limparForm();
            await recarregar();
            setStatus({ tipo: 'ok', msg: 'Bloqueio cadastrado e sincronizado.' });
            setTimeout(() => setStatus(null), 3500);
        } catch (e) {
            setStatus({ tipo: 'erro', msg: e.message || 'Falha ao cadastrar bloqueio.' });
        }
    };

    const abrirEdicao = (b) => {
        setEditando(b);
        setEditMeses(b.meses);
        setEditMotivo(b.motivo);
    };

    const salvarEdicao = async () => {
        if (!editando) return;
        const mes = Number(editMeses);
        if (!mes || mes <= 0) {
            setStatus({ tipo: 'erro', msg: 'Tempo de suspensão inválido.' });
            return;
        }
        if (!editMotivo.trim()) {
            setStatus({ tipo: 'erro', msg: 'Informe o motivo do bloqueio.' });
            return;
        }
        try {
            await atualizarBloqueio(editando.id, { meses: mes, motivo: editMotivo.trim() });
            setEditando(null);
            await recarregar();
            setStatus({ tipo: 'ok', msg: 'Bloqueio atualizado e sincronizado.' });
            setTimeout(() => setStatus(null), 3500);
        } catch (e) {
            setStatus({ tipo: 'erro', msg: e.message || 'Falha ao atualizar bloqueio.' });
        }
    };

    const confirmarExclusao = async () => {
        const alvo = excluindo;
        setExcluindo(null);
        if (!alvo) return;
        await removerBloqueio(alvo.id);
        await recarregar();
        setStatus({ tipo: 'ok', msg: 'Bloqueio removido. PPL liberado antecipadamente.' });
        setTimeout(() => setStatus(null), 3500);
    };

    const dataPrevista = useMemo(() => {
        const mes = Number(meses);
        if (!mes || mes <= 0) return '';
        return somarMesesDataISO(new Date().toISOString(), mes);
    }, [meses]);

    const bloqueiosAtivos = bloqueios.filter(
        (b) => new Date(b.dataLiberacao).getTime() > Date.now(),
    );

    return (
        <div className="space-y-4">
            {/* Formulário de cadastro */}
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                    <Ban className="h-5 w-5 text-[#D9381E]" />
                    <h3 className="font-display text-lg font-bold uppercase tracking-wide">
                        Cadastrar Bloqueio Disciplinar
                    </h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {/* Prontuário com autocomplete */}
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Prontuário do PPL <span className="text-[#D9381E]">*</span>
                        </label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={prontBusca}
                                onChange={(e) => {
                                    setProntBusca(e.target.value);
                                    setProntSelecionado(null);
                                    setMostrarSug(true);
                                }}
                                onFocus={() => setMostrarSug(true)}
                                onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
                                placeholder="Digite o prontuário ou nome do PPL..."
                                className="h-11 w-full rounded-lg border border-border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                            />
                            {mostrarSug && sugestoes.length > 0 && (
                                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                                    {sugestoes.map((p) => (
                                        <li key={p.prontuario}>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => selecionarPpl(p)}
                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#FFB800]/10"
                                            >
                                                <span className="font-num font-semibold">{p.prontuario}</span>
                                                <span className="truncate text-muted-foreground">{p.nome}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {prontSelecionado && (
                            <p className="mt-1 text-xs text-emerald-600">
                                Selecionado: <strong>{prontSelecionado.nome}</strong> (Galeria:{' '}
                                {prontSelecionado.galeria || '—'} · Cubículo: {prontSelecionado.cela || '—'})
                            </p>
                        )}
                    </div>

                    {/* Tempo de suspensão */}
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Tempo de Suspensão (meses) <span className="text-[#D9381E]">*</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 6, 12].map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMeses(m)}
                                    className={`min-h-[40px] rounded-lg border px-4 text-sm font-semibold transition-all ${
                                        Number(meses) === m
                                            ? 'border-[#D4A237] bg-[#FFB800]/20 text-[#0F2232]'
                                            : 'border-border bg-slate-100 text-muted-foreground hover:bg-[#FFB800]/10'
                                    }`}
                                >
                                    {m} {m === 1 ? 'mês' : 'meses'}
                                </button>
                            ))}
                            <input
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={meses}
                                onChange={(e) => setMeses(e.target.value)}
                                className="font-num h-10 w-24 rounded-lg border border-border bg-slate-50 px-3 text-center text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                placeholder="Outro"
                            />
                        </div>
                    </div>

                    {/* Data prevista de liberação */}
                    <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Data de Liberação Prevista
                        </label>
                        <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-slate-100 px-3 text-sm">
                            <CalendarClock className="h-4 w-4 text-[#D4A237]" />
                            <span className="font-num font-semibold text-[#0F2232]">
                                {dataPrevista ? formatarDataBR(dataPrevista) : '—'}
                            </span>
                        </div>
                    </div>

                    {/* Motivo */}
                    <div className="md:col-span-2">
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Motivo do Bloqueio <span className="text-[#D9381E]">*</span>
                        </label>
                        <input
                            type="text"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Ex: Sanção disciplinar, Ordem judicial, Investigação interna..."
                            className="h-11 w-full rounded-lg border border-border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                        />
                    </div>
                </div>

                {status && (
                    <p
                        className={`mt-3 rounded border-l-4 p-2 text-sm ${
                            status.tipo === 'ok'
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                                : 'border-[#D9381E] bg-[#D9381E]/10 text-[#D9381E]'
                        }`}
                    >
                        {status.msg}
                    </p>
                )}

                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={adicionar}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#D9381E] px-6 font-display text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-[#D9381E]/30 active:scale-[0.98]"
                    >
                        <Plus className="h-4 w-4" /> Adicionar Bloqueio
                    </button>
                </div>
            </div>

            {/* Tabela de bloqueios */}
            <div className="rounded-xl border border-border bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
                    <h3 className="font-display text-lg font-bold uppercase tracking-wide">
                        Bloqueios Ativos
                    </h3>
                    <span className="rounded-full bg-[#D9381E]/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-[#D9381E]">
                        {bloqueiosAtivos.length} ativo(s)
                    </span>
                </div>

                {carregando ? (
                    <div className="space-y-2 p-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-9 animate-pulse rounded bg-muted" />
                        ))}
                    </div>
                ) : bloqueios.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        Nenhum bloqueio cadastrado. Adicione um bloqueio acima para impedir
                        temporariamente um PPL de receber encomendas.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-[11px] uppercase tracking-widest text-secondary-foreground">
                                <tr>
                                    <th className="px-3 py-2">Prontuário</th>
                                    <th className="px-3 py-2">Nome do PPL</th>
                                    <th className="px-3 py-2">Motivo</th>
                                    <th className="px-3 py-2">Data de Início</th>
                                    <th className="px-3 py-2">Data de Liberação</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {bloqueios.map((b) => {
                                    const dias = diasRestantes(b.dataLiberacao);
                                    const expirado = dias <= 0;
                                    return (
                                        <tr key={b.id} className={expirado ? 'opacity-50' : 'hover:bg-muted/60'}>
                                            <td className="px-3 py-2 font-num">{b.prontuario}</td>
                                            <td className="px-3 py-2 font-medium">{b.nomePpl || '—'}</td>
                                            <td className="px-3 py-2 max-w-[220px]">
                                                <span className="line-clamp-2">{b.motivo || '—'}</span>
                                            </td>
                                            <td className="px-3 py-2 font-num">{formatarDataBR(b.dataInicio)}</td>
                                            <td className="px-3 py-2">
                                                <span className="font-num">{formatarDataBR(b.dataLiberacao)}</span>
                                                {expirado ? (
                                                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                                                        Expirado
                                                    </span>
                                                ) : (
                                                    <span className="ml-2 rounded bg-[#D9381E]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#D9381E]">
                                                        Faltam {dias} dia(s)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirEdicao(b)}
                                                        title="Editar bloqueio"
                                                        className="grid h-8 w-8 place-items-center rounded border border-border text-[#0F2232] hover:bg-[#FFB800]/15"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setExcluindo(b)}
                                                        title="Remover bloqueio (liberar PPL)"
                                                        className="grid h-8 w-8 place-items-center rounded border border-[#D9381E]/60 text-[#D9381E] hover:bg-[#D9381E]/10"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de edição */}
            {editando && (
                <div className="modal-overlay bg-black/70">
                    <div className="modal-container rounded-xl border border-[#D4A237]/60 bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                Editar Bloqueio
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEditando(null)}
                                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted"
                                aria-label="Fechar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="mb-4 text-sm text-muted-foreground">
                            PPL: <strong className="text-foreground">{editando.nomePpl}</strong> (Prontuário{' '}
                            <span className="font-num">{editando.prontuario}</span>)
                        </p>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Tempo de Suspensão (meses)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={editMeses}
                                    onChange={(e) => setEditMeses(e.target.value)}
                                    className="font-num h-11 w-full rounded-lg border border-border bg-slate-50 px-3 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Nova liberação prevista:{' '}
                                    <span className="font-num font-semibold text-[#0F2232]">
                                        {formatarDataBR(somarMesesDataISO(editando.dataInicio, Number(editMeses) || 0))}
                                    </span>
                                </p>
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Motivo
                                </label>
                                <input
                                    type="text"
                                    value={editMotivo}
                                    onChange={(e) => setEditMotivo(e.target.value)}
                                    className="h-11 w-full rounded-lg border border-border bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setEditando(null)}
                                className="min-h-[44px] rounded border border-slate-300 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={salvarEdicao}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 text-sm font-bold uppercase tracking-wide text-[#0F2232] shadow-lg shadow-[#FFB800]/30 active:scale-[0.98]"
                            >
                                <Save className="h-4 w-4" /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de exclusão */}
            {excluindo && (
                <div className="modal-overlay bg-black/70">
                    <div className="modal-container rounded-xl border border-[#D9381E]/60 bg-white p-6 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3">
                            <AlertTriangle className="h-7 w-7 flex-shrink-0 text-[#D9381E]" />
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                Remover Bloqueio
                            </h2>
                        </div>
                        <p className="mb-6 text-sm leading-relaxed text-slate-600">
                            Confirma a remoção do bloqueio de{' '}
                            <strong>{excluindo.nomePpl}</strong> (prontuário{' '}
                            <span className="font-num">{excluindo.prontuario}</span>)? O PPL será{' '}
                            <strong className="text-emerald-600">liberado antecipadamente</strong> para
                            receber encomendas. A alteração será sincronizada com o Firebase.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setExcluindo(null)}
                                className="min-h-[44px] rounded border border-slate-300 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarExclusao}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#D9381E] px-5 text-sm font-bold uppercase tracking-wide text-white active:scale-[0.98]"
                            >
                                <Trash2 className="h-4 w-4" /> Remover e Liberar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* Helper local de formatação DD/MM/AAAA */
function formatarDataBR(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/* ─── Página de Configurações ─────────────────────────────────────────────── */
export default function ConfiguracoesPage() {
    const [autenticado, setAutenticado] = useState(false);
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [erroLogin, setErroLogin] = useState('');
    const [verificando, setVerificando] = useState(true);

    // Configurações
    const [alasTriagem, setAlasTriagem] = useState([]);
    const [alasCastigo, setAlasCastigo] = useState([]);
    const [intervaloVestuario, setIntervaloVestuario] = useState(4);
    const [brasaoPreview, setBrasaoPreview] = useState(null);
    const [brasaoStatus, setBrasaoStatus] = useState(null);
    const [salvo, setSalvo] = useState(null);

    const carregar = useCallback(async () => {
        const cfg = await getAllConfig();
        setAlasTriagem(cfg.alasTriagem || []);
        setAlasCastigo(cfg.alasCastigo || []);
        setIntervaloVestuario(cfg.intervaloVestuario || 4);
        const brasao = await getBrasaoImpressao();
        setBrasaoPreview(brasao || null);
    }, []);

    useEffect(() => {
        (async () => {
            await seedConfig();
            await seedCatalogo();
            setVerificando(false);
        })();
    }, []);

    // Recarrega alas/intervalo/brasão quando outro dispositivo salva no Firebase
    useEffect(() => {
        if (!autenticado) return;
        const onSync = () => {
            carregar().catch((e) => console.warn('Recarga settings Firebase:', e?.message || e));
        };
        window.addEventListener('firebase-settings-sync', onSync);
        return () => window.removeEventListener('firebase-settings-sync', onSync);
    }, [autenticado, carregar]);

    const entrar = async (e) => {
        e.preventDefault();
        setErroLogin('');
        const ok = await validarAdmin(login, senha);
        if (ok) {
            setAutenticado(true);
            setSenha('');
            await carregar();
        } else {
            setErroLogin('Login ou senha inválidos.');
        }
    };

    const sair = () => {
        setAutenticado(false);
        setLogin('');
        setSenha('');
    };

    const salvarConfig = async () => {
        const norm = (lista) =>
            lista
                .map((f) => ({ inicio: Number(f.inicio), fim: Number(f.fim) }))
                .filter((f) => Number.isFinite(f.inicio) && Number.isFinite(f.fim) && f.inicio <= f.fim);
        await setConfig('alasTriagem', norm(alasTriagem));
        await setConfig('alasCastigo', norm(alasCastigo));
        const meses = Number(intervaloVestuario);
        await setConfig('intervaloVestuario', meses > 0 ? meses : 4);
        await carregar();
        // Publica config + catálogo no Firebase (/settings) para todos os dispositivos
        salvarSettingsFirebase().catch((e) => console.warn('Sync settings Firebase:', e?.message || e));
        setSalvo({ tipo: 'ok', msg: 'Configurações salvas e sincronizadas com sucesso!' });
        // Rolagem suave até o topo + toast de sucesso
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => setSalvo(null), 3500);
    };

    const onBrasaoFile = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            setBrasaoStatus({ tipo: 'erro', msg: 'Selecione um arquivo de imagem válido.' });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setBrasaoStatus({ tipo: 'erro', msg: 'A imagem deve ter no máximo 2 MB.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = String(reader.result || '');
            await setBrasaoImpressao(dataUrl);
            setBrasaoPreview(dataUrl);
            setBrasaoStatus({ tipo: 'ok', msg: 'Brasão atualizado e aplicado na ficha de impressão.' });
            setTimeout(() => setBrasaoStatus(null), 3500);
            // Sincroniza o brasão com o Firebase (/settings/config)
            sincronizarConfigFirebase().catch((e) => console.warn('Sync brasão Firebase:', e?.message || e));
        };
        reader.onerror = () => {
            setBrasaoStatus({ tipo: 'erro', msg: 'Falha ao ler o arquivo de imagem.' });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const removerBrasao = async () => {
        await setBrasaoImpressao(null);
        setBrasaoPreview(null);
        setBrasaoStatus({ tipo: 'ok', msg: 'Brasão personalizado removido. O brasão padrão será usado.' });
        setTimeout(() => setBrasaoStatus(null), 3500);
        sincronizarConfigFirebase().catch((e) => console.warn('Sync brasão Firebase:', e?.message || e));
    };

    if (verificando) {
        return (
            <div className="nao-imprimir flex min-h-[50vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D4A237] border-t-transparent" />
            </div>
        );
    }

    /* ─── Tela de login ─── */
    if (!autenticado) {
        return (
            <>
                <Helmet>
                    <title>Configurações — Sistema de registro de sacolas e sedex</title>
                    <meta
                        name="description"
                        content="Área administrativa protegida por autenticação para configurar alas restritas, catálogo e prazos."
                    />
                </Helmet>
                <div className="nao-imprimir flex min-h-[60vh] items-center justify-center px-4">
                    <form
                        onSubmit={entrar}
                        className="w-full max-w-sm rounded-xl border border-[#D4A237]/40 bg-white p-6 shadow-2xl"
                    >
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0F2232] text-[#FFB800]">
                                <Lock className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="font-display text-xl font-bold uppercase tracking-wide">
                                    Área Restrita
                                </h1>
                                <p className="text-sm text-muted-foreground">Configurações administrativas</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Login
                                </label>
                                <input
                                    type="text"
                                    value={login}
                                    onChange={(e) => setLogin(e.target.value)}
                                    autoFocus
                                    placeholder="Login do administrador"
                                    className="h-11 w-full rounded-lg border border-border bg-slate-100 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Senha
                                </label>
                                <input
                                    type="password"
                                    value={senha}
                                    onChange={(e) => setSenha(e.target.value)}
                                    placeholder="••••••••"
                                    className="h-11 w-full rounded-lg border border-border bg-slate-100 px-3 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                            </div>
                        </div>

                        {erroLogin && (
                            <p className="mt-3 rounded border border-[#D9381E]/60 bg-[#D9381E]/10 px-3 py-2 text-sm font-semibold text-[#D9381E]">
                                {erroLogin}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] font-display text-base font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.01] active:scale-[0.98]"
                        >
                            <Unlock className="h-4 w-4" /> Entrar
                        </button>
                    </form>
                </div>
            </>
        );
    }

    /* ─── Painel de configurações ─── */
    const totalCubiculos =
        alasTriagem.filter((f) => f.inicio && f.fim).length +
        alasCastigo.filter((f) => f.inicio && f.fim).length;

    return (
        <>
            <Helmet>
                <title>Configurações — Sistema de registro de sacolas e sedex</title>
                <meta
                    name="description"
                    content="Gerencie alas restritas, catálogo de itens e prazo de vestuário do sistema de registro de sacolas e sedex."
                />
            </Helmet>

            <div className="nao-imprimir space-y-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="mr-auto">
                        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Configurações</h1>
                        <p className="text-sm text-muted-foreground">
                            Gerencie alas restritas, catálogo de itens e prazo de vestuário.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={sair}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-4 text-sm font-semibold text-[#D9381E] hover:bg-[#D9381E]/20 active:scale-[0.98]"
                    >
                        <LogOut className="h-4 w-4" /> Sair
                    </button>
                </div>

                {salvo && (
                    <div
                        className={`flex items-center gap-2 rounded border px-4 py-2 text-sm font-semibold ${
                            salvo.tipo === 'ok'
                                ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                                : 'border-[#D9381E] bg-[#D9381E]/10 text-[#D9381E]'
                        }`}
                    >
                        <Check className="h-4 w-4" /> {salvo.msg}
                    </div>
                )}

                {/* ── Alas Não Permitidas ── */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-[#0F2232]" />
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                            Alas Não Permitidas
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Cadastre as faixas de cubículos restritos. As validações do cadastro e da importação CSV
                        consultarão estas configurações dinamicamente.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <PainelAla
                            titulo="Ala de Triagem"
                            descricao="Cubículos nesta ala geram alerta e exigem confirmação para forçar o lançamento."
                            cor="bg-[#D9381E]"
                            alas={alasTriagem}
                            setAlas={setAlasTriagem}
                        />
                        <PainelAla
                            titulo="Ala de Castigo"
                            descricao="Cubículos nesta ala geram alerta e exigem confirmação para forçar o lançamento."
                            cor="bg-[#FFB800]"
                            alas={alasCastigo}
                            setAlas={setAlasCastigo}
                        />
                    </div>
                </section>

                {/* ── Gestão de Base de PPLs ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-[#0F2232]" />
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                            Gestão de Base de PPLs
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Importe, edite e remova os internos da base de PPLs. Apenas administradores autenticados
                        podem alterar a base. As alterações sincronizam automaticamente com o Firebase e ficam
                        disponíveis na busca da tela de Registro em todos os dispositivos.
                    </p>
                    <SecaoBasePpl />
                </section>

                {/* ── Bloqueio Temporário de PPL ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Ban className="h-5 w-5 text-[#D9381E]" />
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                            Bloqueio Temporário de PPL
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Cadastre impedimentos disciplinares ou administrativos. Um PPL bloqueado
                        <strong> não poderá receber encomendas</strong> na tela de Registro até a data de
                        liberação expirar ou até que o bloqueio seja removido manualmente aqui. Não há
                        opção de forçar lançamento para este tipo de bloqueio.
                    </p>
                    <SecaoBloqueioPpl />
                </section>

                {/* ── Prazo de Vestuário ── */}
                <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                    <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                        Intervalo de Vestuário
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Define o intervalo mínimo (em meses) entre entregas da categoria Vestuário. O cálculo da
                        próxima data na ficha de impressão usará este valor.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={intervaloVestuario}
                            onChange={(e) => setIntervaloVestuario(e.target.value)}
                            className="font-num h-11 w-32 rounded-lg border border-border bg-slate-100 px-3 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                        />
                        <span className="text-sm font-semibold text-muted-foreground">meses</span>
                    </div>
                </section>

                {/* ── Brasão da Impressão ── */}
                <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-[#0F2232]" />
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                            Brasão / Logotipo da Impressão
                        </h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Envie a imagem do brasão que aparecerá no canto superior esquerdo da ficha de
                        impressão (Via 1 e Via 2). A imagem é salva localmente no navegador e aplicada
                        automaticamente. Recomendado: PNG quadrado, até 2 MB.
                    </p>

                    {brasaoStatus && (
                        <div
                            className={`mt-3 flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold ${
                                brasaoStatus.tipo === 'ok'
                                    ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                                    : 'border-[#D9381E] bg-[#D9381E]/10 text-[#D9381E]'
                            }`}
                        >
                            {brasaoStatus.msg}
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-4">
                        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-lg border border-border bg-slate-50">
                            {brasaoPreview ? (
                                <img
                                    src={brasaoPreview}
                                    alt="Pré-visualização do brasão"
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]">
                                <Upload className="h-4 w-4" /> Enviar brasão
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={onBrasaoFile}
                                    className="hidden"
                                />
                            </label>
                            {brasaoPreview && (
                                <button
                                    type="button"
                                    onClick={removerBrasao}
                                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-4 text-sm font-semibold text-[#D9381E] hover:bg-[#D9381E]/20 active:scale-[0.98]"
                                >
                                    <Trash2 className="h-4 w-4" /> Remover
                                </button>
                            )}
                        </div>
                    </div>
                    {!brasaoPreview && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            Nenhum brasão personalizado enviado — a ficha usará o brasão padrão.
                        </p>
                    )}
                </section>

                {/* ── Catálogo ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                            Catálogo de Itens
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Itens inativos deixam de aparecer na tela de lançamento, mas permanecem no histórico já
                        registrado.
                    </p>
                    <SecaoCatalogo />
                </section>

                {/* ── Botão salvar geral ── */}
                <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[#D4A237]/60 bg-white/95 p-3 shadow-lg backdrop-blur">
                    <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 text-[#D4A237]" />
                        {totalCubiculos} faixa(s) de cubículos configurada(s).
                    </div>
                    <button
                        type="button"
                        onClick={salvarConfig}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-6 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Save className="h-4 w-4" /> Salvar configurações
                    </button>
                </div>
            </div>
        </>
    );
}
