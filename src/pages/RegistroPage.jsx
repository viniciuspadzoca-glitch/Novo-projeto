import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    AlertTriangle,
    Ban,
    BarChart3,
    CheckCircle2,
    Lock,
    Minus,
    Package,
    Pencil,
    Plus,
    Printer,
    Search,
    ShoppingBag,
    ShieldAlert,
    ShieldX,
    Users,
    X,
    Zap,
} from 'lucide-react';
import Comprovante from '@/components/Comprovante';
import { CATEGORIAS, db, seedCatalogo } from '@/lib/db';
import { liveQuery } from 'dexie';
import {
    agoraISO,
    diffDias,
    formatarData,
    formatarDataHora,
    travaFrequenciaUnificada,
    travasVestuario,
    ultimoRegistroGlobal,
} from '@/lib/regras';
import {
    cubiculoEmAla,
    getAlasCastigo,
    getAlasTriagem,
    getIntervaloVestuario,
    seedConfig,
} from '@/lib/config';
import { getBloqueioAtivo, diasRestantes as diasRestantesBloqueio } from '@/lib/bloqueios';
import { gerarChave, salvarRegistroFirebase, dataHojeISO, dataLocalISO } from '@/lib/firebase';

const OPCOES_PARENTESCO = ['Mãe', 'Esposa', 'Irmã(o)', 'Pai', 'Filho(a)', 'Outro'];

function extrairCubiculo(bloco) {
    if (!bloco) return '';
    const partes = String(bloco).trim().split(/[\/\s-]+/);
    const ultimo = partes[partes.length - 1];
    return ultimo && !isNaN(ultimo) ? ultimo : (ultimo || bloco);
}

export default function RegistroPage() {
    const [tipo, setTipo] = useState(() => localStorage.getItem('jumbo_tipo') || 'SACOLA');
    const [modo, setModo] = useState(() => localStorage.getItem('jumbo_modo') || 'auto');
    const [ppl, setPpl] = useState(null);
    const [pplPendente, setPplPendente] = useState(null);

    // Busca (modo automático)
    const [prontuarioBusca, setProntuarioBusca] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [naoEncontrado, setNaoEncontrado] = useState(false);

    // Modal states
    const [modalPreCadastro, setModalPreCadastro] = useState(false);
    const [modalTrava30, setModalTrava30] = useState(false);
    const [modalItens, setModalItens] = useState(false);

    // Pre-registration fields
    const [preEditavel, setPreEditavel] = useState(false);
    const [preProntuario, setPreProntuario] = useState('');
    const [preNomePpl, setPreNomePpl] = useState('');
    const [preGaleria, setPreGaleria] = useState('');
    const [preCubiculo, setPreCubiculo] = useState('');
    const [preCidade, setPreCidade] = useState('');
    const [preNomeVisita, setPreNomeVisita] = useState('');
    const [preCredencial, setPreCredencial] = useState('');
    const [preGrauParentesco, setPreGrauParentesco] = useState('');
    const [preGrauOutro, setPreGrauOutro] = useState('');

    // Item entry
    const [itens, setItens] = useState([]);
    const [quantidades, setQuantidades] = useState({});
    const [observacoes, setObservacoes] = useState({});
    const [forcado30, setForcado30] = useState(false);

    // PPL history & trava
    const [registrosPpl, setRegistrosPpl] = useState([]);
    const [trava30, setTrava30] = useState(null);
    const [ultimoGlobal, setUltimoGlobal] = useState(null);

    const [ultimoSalvo, setUltimoSalvo] = useState(null);
    const [carregando, setCarregando] = useState(true);

    // Painel em tempo real — métricas do dia (apenas registros da data de hoje,
    // alimentado pelo ouvinte Firebase registros/{DATA_HOJE} via liveQuery).
    const [metricasHoje, setMetricasHoje] = useState({ sacolas: 0, sedex: 0, total: 0 });

    // Cubiculo validation modals
    const [modalTriagem, setModalTriagem] = useState(false);
    const [modalCastigo, setModalCastigo] = useState(false);
    const [pplBloqueado, setPplBloqueado] = useState(null);

    // Visitor selector
    const [modalSeletorVisitante, setModalSeletorVisitante] = useState(false);
    const [fluxoPendente, setFluxoPendente] = useState(null);
    const [visitantesDisponiveis, setVisitantesDisponiveis] = useState([]);

    // Bloqueio disciplinar absoluto
    const [modalBloqueio, setModalBloqueio] = useState(false);
    const [bloqueioInfo, setBloqueioInfo] = useState(null);

    // Configurações dinâmicas (alas restritas + intervalo vestuário)
    const [alasTriagem, setAlasTriagem] = useState([]);
    const [alasCastigo, setAlasCastigo] = useState([]);
    const [intervaloVestuario, setIntervaloVestuario] = useState(4);
    const [alaRestrita, setAlaRestrita] = useState(null); // 'Triagem' | 'Castigo' | null

    useEffect(() => {
        seedConfig()
            .then(() => Promise.all([getAlasTriagem(), getAlasCastigo(), getIntervaloVestuario()]))
            .then(([t, c, v]) => {
                setAlasTriagem(t);
                setAlasCastigo(c);
                setIntervaloVestuario(v);
            });
    }, []);

    useEffect(() => {
        seedCatalogo()
            .then(() => db.itens.filter((i) => i.ativo === 1).toArray())
            .then((lista) => setItens(lista))
            .finally(() => setCarregando(false));
    }, []);

    // Recarrega alas/intervalo e catálogo quando outro dispositivo salva as
    // configurações no Firebase — mantém a tela de Registro sempre atualizada.
    useEffect(() => {
        const onSync = () => {
            Promise.all([getAlasTriagem(), getAlasCastigo(), getIntervaloVestuario()])
                .then(([t, c, v]) => {
                    setAlasTriagem(t);
                    setAlasCastigo(c);
                    setIntervaloVestuario(v);
                })
                .catch((e) => console.warn('Recarga config Registro:', e?.message || e));
            db.itens
                .filter((i) => i.ativo === 1)
                .toArray()
                .then((lista) => setItens(lista))
                .catch((e) => console.warn('Recarga catálogo Registro:', e?.message || e));
        };
        window.addEventListener('firebase-settings-sync', onSync);
        return () => window.removeEventListener('firebase-settings-sync', onSync);
    }, []);

    useEffect(() => {
        localStorage.setItem('jumbo_tipo', tipo);
    }, [tipo]);

    useEffect(() => {
        localStorage.setItem('jumbo_modo', modo);
    }, [modo]);

    const carregarRegistros = useCallback(async (prontuario) => {
        const lista = await db.PPL_Historico.where('prontuario').equals(prontuario).toArray();
        lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return lista;
    }, []);

    // Atualização em tempo real do histórico do PPL atual: quando o Firebase
    // mescla registros remotos no IndexedDB, o liveQuery reflete na UI sem
    // recarregar a página (inclusive lançamentos feitos em outros dispositivos).
    useEffect(() => {
        if (!ppl?.prontuario) return;
        const sub = liveQuery(() =>
            db.PPL_Historico.where('prontuario').equals(ppl.prontuario).toArray(),
        ).subscribe((lista) => {
            lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
            setRegistrosPpl(lista);
            setUltimoGlobal(ultimoRegistroGlobal(lista));
        });
        return () => sub.unsubscribe();
    }, [ppl?.prontuario]);

    // Painel em tempo real do dia: conta apenas registros cuja data (America/
    // Sao_Paulo) seja igual a hoje. O ouvinte Firebase registros/{DATA_HOJE}
    // mescla no IndexedDB apenas os registros de hoje, e o liveQuery abaixo
    // recalcula as métricas instantaneamente em todos os dispositivos.
    useEffect(() => {
        const hoje = dataHojeISO();
        const sub = liveQuery(() => db.PPL_Historico.toArray()).subscribe((lista) => {
            const doDia = lista.filter((r) => dataLocalISO(r.criadoEm) === hoje);
            const sacolas = doDia.filter((r) => r.tipo === 'SACOLA').length;
            const sedex = doDia.filter((r) => r.tipo === 'SEDEX').length;
            setMetricasHoje({ sacolas, sedex, total: sacolas + sedex });
        });
        return () => sub.unsubscribe();
    }, []);

    const abrirPreCadastro = (pplBase, visitante, editavel) => {
        setPplPendente(pplBase);
        const cela = pplBase.cela || extrairCubiculo(pplBase.bloco) || '';
        setPreProntuario(pplBase.prontuario || '');
        setPreNomePpl(pplBase.nome || '');
        setPreGaleria(pplBase.galeria || '');
        setPreCubiculo(cela);
        setPreCidade(pplBase.cidade || '');
        setPreNomeVisita(visitante?.nomeVisita || '');
        setPreCredencial(visitante?.credencial || '');
        const afinidade = visitante?.afinidade || '';
        if (afinidade && !OPCOES_PARENTESCO.includes(afinidade)) {
            setPreGrauParentesco('Outro');
            setPreGrauOutro(afinidade);
        } else {
            setPreGrauParentesco(afinidade || '');
            setPreGrauOutro('');
        }
        setPreEditavel(editavel);
        setNaoEncontrado(false);
        setModalPreCadastro(true);
    };

    // ─── Abre a etapa de visita (somente após validação de alertas) ───
    const abrirEtapaVisita = (pplBase, visitantes) => {
        if (!visitantes || visitantes.length === 0) {
            abrirPreCadastro(pplBase, null, false);
        } else if (visitantes.length === 1) {
            abrirPreCadastro(pplBase, visitantes[0], false);
        } else {
            setPplPendente(pplBase);
            setVisitantesDisponiveis(visitantes);
            setModalSeletorVisitante(true);
        }
    };

    const verificarTrava30 = useCallback(async (pplBase, visitantes) => {
        const registros = await carregarRegistros(pplBase.prontuario);
        setRegistrosPpl(registros);
        setUltimoGlobal(ultimoRegistroGlobal(registros));
        const trava = travaFrequenciaUnificada(registros);
        setTrava30(trava);
        setForcado30(false);
        if (trava) {
            setPplPendente(pplBase);
            setModalTrava30(true);
            return;
        }
        abrirEtapaVisita(pplBase, visitantes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carregarRegistros]);

    // ─── Verificação imediata de alertas (bloqueio absoluto / triagem / castigo / 30 dias) ───
    const verificarAlertas = async (pplBase, visitantes) => {
        setFluxoPendente({ pplBase, visitantes });
        setAlaRestrita(null);
        // BLOQUEIO ABSOLUTO (sanção disciplinar / motivo administrativo) — sem exceção
        const bloqueio = await getBloqueioAtivo(pplBase.prontuario);
        if (bloqueio) {
            setBloqueioInfo({ bloqueio, ppl: pplBase });
            setModalBloqueio(true);
            return;
        }
        if (cubiculoEmAla(pplBase.cela, alasTriagem)) {
            setPplBloqueado(pplBase);
            setModalTriagem(true);
            return;
        }
        if (cubiculoEmAla(pplBase.cela, alasCastigo)) {
            setPplBloqueado(pplBase);
            setModalCastigo(true);
            return;
        }
        await verificarTrava30(pplBase, visitantes);
    };

    // ─── Modo Automático: busca por prontuário no CSV ───
    const buscarProntuario = async (valor) => {
        const pront = String(valor ?? prontuarioBusca).trim();
        if (!pront) return;
        setBuscando(true);
        setNaoEncontrado(false);
        try {
            const rows = await db.PPL_Base.where('prontuario').equals(pront).toArray();
            if (!rows.length) {
                setNaoEncontrado(true);
                return;
            }
            const primeiro = rows[0];
            const cela = primeiro.cela || (primeiro.bloco ? primeiro.bloco.replace(/^Cubículo\s*/i, '').trim() : '');
            const pplBase = {
                prontuario: primeiro.prontuario,
                nome: primeiro.nomePpl || primeiro.nome || '',
                galeria: primeiro.galeria || '',
                cela,
                bloco: cela || primeiro.bloco || '',
            };
            const visitantes = rows
                .filter((r) => r.nomeVisita)
                .map((r) => ({
                    prontuario: r.prontuario,
                    nomeVisita: r.nomeVisita,
                    credencial: r.credencial || '',
                    afinidade: r.afinidade || '',
                }));

            await verificarAlertas(pplBase, visitantes);
        } catch (_) {
            setNaoEncontrado(true);
        } finally {
            setBuscando(false);
        }
    };

    // ─── Modo Manual: abre pré-cadastro com todos os campos editáveis ───
    const iniciarManual = () => {
        setNaoEncontrado(false);
        abrirPreCadastro(
            { prontuario: prontuarioBusca || '', nome: '', galeria: '', cela: '', bloco: '' },
            null,
            true,
        );
    };

    const alternarParaManual = () => {
        setModo('manual');
        iniciarManual();
    };

    const trocarModo = (novoModo) => {
        if (novoModo === modo) return;
        setModo(novoModo);
        setNaoEncontrado(false);
        setProntuarioBusca('');
        if (novoModo === 'manual') {
            iniciarManual();
        }
    };

    const prosseguirCadastro = async (pAtualizado, jaVerificado = false) => {
        const registros = await carregarRegistros(pAtualizado.prontuario);
        setRegistrosPpl(registros);

        const ultimo = ultimoRegistroGlobal(registros);
        setUltimoGlobal(ultimo);
        const trava = travaFrequenciaUnificada(registros);
        setTrava30(trava);
        if (!jaVerificado) setForcado30(false);

        setPpl(pAtualizado);
        setQuantidades({});
        setObservacoes({});
        setUltimoSalvo(null);
        setModalPreCadastro(false);
        setModalSeletorVisitante(false);
        setPplPendente(null);
        setFluxoPendente(null);
        setProntuarioBusca('');

        if (trava && !jaVerificado) {
            setModalTrava30(true);
        } else {
            setModalItens(true);
        }
    };

    const confirmarPreCadastro = async () => {
        const grauFinal = preGrauParentesco === 'Outro' ? preGrauOutro.trim() : preGrauParentesco;
        if (
            !preProntuario.trim() ||
            !preNomePpl.trim() ||
            !preCubiculo.trim() ||
            !preNomeVisita.trim() ||
            !grauFinal
        ) {
            return;
        }

        const pAtualizado = {
            prontuario: preProntuario.trim(),
            nome: preNomePpl.trim(),
            galeria: preGaleria.trim(),
            cela: preCubiculo.trim(),
            bloco: preCubiculo.trim(),
            cidade: preCidade.trim(),
            nomeVisita: preNomeVisita.trim(),
            credencial: preCredencial.trim(),
            grauParentesco: grauFinal,
        };

        const jaVerificado = !!fluxoPendente;
        // BLOQUEIO ABSOLUTO em modo manual — sem exceção
        if (!jaVerificado) {
            const bloqueio = await getBloqueioAtivo(pAtualizado.prontuario);
            if (bloqueio) {
                setModalPreCadastro(false);
                setBloqueioInfo({ bloqueio, ppl: pAtualizado });
                setModalBloqueio(true);
                return;
            }
        }
        if (!jaVerificado && cubiculoEmAla(pAtualizado.cela, alasTriagem)) {
            setModalPreCadastro(false);
            setPplBloqueado(pAtualizado);
            setModalTriagem(true);
            return;
        }
        if (!jaVerificado && cubiculoEmAla(pAtualizado.cela, alasCastigo)) {
            setModalPreCadastro(false);
            setPplBloqueado(pAtualizado);
            setModalCastigo(true);
            return;
        }

        await prosseguirCadastro(pAtualizado, jaVerificado);
    };

    const travasVest = useMemo(
        () => (ppl ? travasVestuario(registrosPpl, intervaloVestuario) : {}),
        [ppl, registrosPpl, intervaloVestuario],
    );

    const itensLancados = useMemo(
        () =>
            itens
                .filter((i) => Number(quantidades[i.id]) > 0)
                .map((i) => ({ nome: i.nome, categoria: i.categoria, quantidade: Number(quantidades[i.id]) })),
        [itens, quantidades],
    );

    const salvar = async () => {
        if (!ppl || !itensLancados.length) return;
        const criadoEm = agoraISO();
        const fbKey = gerarChave('registros');
        const registro = {
            prontuario: ppl.prontuario,
            ppl: { ...ppl },
            tipo,
            criadoEm,
            itens: itensLancados,
            observacoes,
            forcado: forcado30 || !!alaRestrita,
            forcado30,
            alaRestrita,
            intervaloVestuario,
            fbKey,
        };
        const id = await db.PPL_Historico.add({ ...registro, data: criadoEm });
        const salvo = { ...registro, id };
        // Sincroniza com o Firebase Realtime Database (tempo real entre dispositivos)
        salvarRegistroFirebase(salvo).catch((e) =>
            console.warn('Sincronização Firebase falhou (registro salvo localmente):', e?.message || e),
        );
        setUltimoSalvo(salvo);
        setQuantidades({});
        setObservacoes({});
        setAlaRestrita(null);
        setModalItens(false);
        const registros = await carregarRegistros(ppl.prontuario);
        setRegistrosPpl(registros);
        setTimeout(() => window.print(), 300);
    };

    const trocarPpl = () => {
        setPpl(null);
        setRegistrosPpl([]);
        setTrava30(null);
        setUltimoGlobal(null);
        setUltimoSalvo(null);
        setQuantidades({});
        setObservacoes({});
        setForcado30(false);
        setAlaRestrita(null);
        setProntuarioBusca('');
        setNaoEncontrado(false);
    };

    // ─── Forçar lançamento em ala restrita (Triagem ou Castigo) ───
    const forcarLancamentoAla = (alaNome) => {
        const p = pplBloqueado;
        setAlaRestrita(alaNome);
        setModalTriagem(false);
        setModalCastigo(false);
        setPplBloqueado(null);
        if (fluxoPendente) {
            verificarTrava30(fluxoPendente.pplBase, fluxoPendente.visitantes);
        } else {
            prosseguirCadastro(p, false);
        }
    };

    const cubiculo = ppl?.cela || extrairCubiculo(ppl?.bloco);
    const pplAlerta = fluxoPendente?.pplBase || ppl;

    const preCadastroValido =
        preProntuario.trim() &&
        preNomePpl.trim() &&
        preCubiculo.trim() &&
        preNomeVisita.trim() &&
        preGrauParentesco &&
        (preGrauParentesco !== 'Outro' || preGrauOutro.trim());

    return (
        <>
            <Helmet>
                <title>Sistema de registro de sacolas e sedex</title>
                <meta
                    name="description"
                    content="Registre entregas de Sacola e SEDEX para pessoas privadas de liberdade com travas automáticas de 30 dias e 4 meses, offline-first."
                />
            </Helmet>

            <div className="nao-imprimir space-y-5">
                {/* ── Painel em tempo real — métricas do dia ── */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="relative overflow-hidden rounded-xl border border-[#D4A237]/40 bg-white/80 p-4 shadow-sm backdrop-blur-md">
                        <ShoppingBag className="pointer-events-none absolute right-3 top-3 h-8 w-8 text-[#0F2232]/15" strokeWidth={1.5} aria-hidden />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Sacolas do Dia
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricasHoje.sacolas}</p>
                    </div>
                    <div className="relative overflow-hidden rounded-xl border border-[#D4A237]/40 bg-white/80 p-4 shadow-sm backdrop-blur-md">
                        <Package className="pointer-events-none absolute right-3 top-3 h-8 w-8 text-[#0F2232]/15" strokeWidth={1.5} aria-hidden />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Sedex do Dia
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricasHoje.sedex}</p>
                    </div>
                    <div className="relative overflow-hidden rounded-xl border border-[#D4A237]/60 bg-[#FFB800]/10 p-4 shadow-sm backdrop-blur-md">
                        <BarChart3 className="pointer-events-none absolute right-3 top-3 h-8 w-8 text-[#0F2232]/20" strokeWidth={1.5} aria-hidden />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0F2232]/70">
                            Total Geral do Dia
                        </p>
                        <p className="font-num mt-1 text-3xl font-bold text-[#0F2232]">{metricasHoje.total}</p>
                    </div>
                </div>

                {/* Tipo + Modo + Busca */}
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#D4A237]/40 bg-white/80 backdrop-blur-md p-3 shadow-lg">
                    <span className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Tipo
                    </span>
                    <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/80">
                        {['SACOLA', 'SEDEX'].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTipo(t)}
                                className={`min-h-[40px] rounded-full px-5 font-display text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] ${
                                    tipo === t
                                        ? 'bg-[#0F2232] text-white shadow-md'
                                        : 'bg-transparent text-slate-500 hover:text-[#0F2232]'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />

                    {/* Alternador de modo */}
                    <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/80">
                        <button
                            type="button"
                            onClick={() => trocarModo('auto')}
                            className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 font-display text-sm font-semibold uppercase tracking-wide transition-all active:scale-[0.98] ${
                                modo === 'auto'
                                    ? 'bg-[#0F2232] text-white shadow-md'
                                    : 'bg-transparent text-slate-500 hover:text-[#0F2232]'
                            }`}
                        >
                            <Zap className="h-4 w-4" /> Automático
                        </button>
                        <button
                            type="button"
                            onClick={() => trocarModo('manual')}
                            className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 font-display text-sm font-semibold uppercase tracking-wide transition-all active:scale-[0.98] ${
                                modo === 'manual'
                                    ? 'bg-[#0F2232] text-white shadow-md'
                                    : 'bg-transparent text-slate-500 hover:text-[#0F2232]'
                            }`}
                        >
                            <Pencil className="h-4 w-4" /> Manual
                        </button>
                    </div>

                    {/* Busca por prontuário (modo automático) */}
                    {modo === 'auto' && !ppl && (
                        <div className="min-w-[260px] flex-1">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    buscarProntuario();
                                }}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-[#D4A237]/50"
                            >
                                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                                <input
                                    autoFocus
                                    value={prontuarioBusca}
                                    onChange={(e) => {
                                        setProntuarioBusca(e.target.value);
                                        if (naoEncontrado) setNaoEncontrado(false);
                                    }}
                                    placeholder="Digite o prontuário e tecle ENTER..."
                                    className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                />
                                <button
                                    type="submit"
                                    disabled={buscando || !prontuarioBusca.trim()}
                                    className="shrink-0 rounded-md bg-[#FFB800] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#0F2232] shadow-sm transition-all hover:bg-[#E5A700] active:scale-[0.98] disabled:opacity-40"
                                >
                                    {buscando ? '...' : 'Buscar'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Botão iniciar manual */}
                    {modo === 'manual' && !ppl && (
                        <button
                            type="button"
                            onClick={iniciarManual}
                            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-6 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.01] active:scale-[0.98]"
                        >
                            <Pencil className="h-4 w-4" /> Iniciar Cadastro Manual
                        </button>
                    )}
                </div>

                {/* Aviso prontuário não encontrado (modo automático) */}
                {modo === 'auto' && naoEncontrado && !ppl && (
                    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#D4A237]/60 bg-[#FFB800]/15 p-4 text-[#0F2232]">
                        <AlertTriangle className="h-6 w-6 shrink-0 text-[#0F2232]" />
                        <div className="flex-1 text-sm">
                            <p className="font-semibold">
                                Prontuário <span className="font-num">{prontuarioBusca}</span> não localizado na base de CSV.
                            </p>
                            <p className="mt-0.5 text-[#0F2232]/80">
                                Verifique o número digitado ou importe um novo CSV. Caso necessário, você pode realizar o
                                cadastro em Modo Manual.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={alternarParaManual}
                            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#D4A237]/60 bg-[#FFB800]/20 px-5 font-display text-sm font-bold uppercase tracking-wide text-[#0F2232] transition-all hover:bg-[#FFB800]/30 active:scale-[0.98]"
                        >
                            <Pencil className="h-4 w-4" /> Alternar para Modo Manual
                        </button>
                    </div>
                )}

                {!ppl && !naoEncontrado && (
                    <div className="rounded-xl border border-dashed border-[#D4A237]/40 bg-slate-50 p-10 text-center">
                        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="font-display text-2xl font-semibold">
                            {modo === 'auto'
                                ? 'Digite o prontuário para iniciar o lançamento'
                                : 'Inicie um cadastro manual para o lançamento'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {modo === 'auto'
                                ? 'O sistema buscará o PPL na base do CSV e preencherá os dados automaticamente.'
                                : 'Todos os campos da ficha ficarão liberados para digitação livre pelo operador.'}
                        </p>
                    </div>
                )}

                {ppl && (
                    <>
                        {/* Card do PPL */}
                        <div className="rounded-xl border border-[#D4A237]/40 bg-white/80 backdrop-blur-md shadow-lg">
                            <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-b border-border p-4">
                                <div className="flex-1">
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">PPL</p>
                                    <p className="font-display text-2xl font-bold leading-tight">{ppl.nome}</p>
                                    <p className="font-num mt-0.5 text-sm text-muted-foreground">
                                        Prontuário: {ppl.prontuario}
                                        {ppl.galeria ? ` · Galeria: ${ppl.galeria}` : ''}
                                        {cubiculo ? ` · Cubículo: ${cubiculo}` : ''}
                                        {ppl.cidade ? ` · ${ppl.cidade}` : ''}
                                    </p>
                                </div>
                                {cubiculo && (
                                    <span className="rounded bg-foreground px-3 py-1.5 font-display text-xl font-bold tracking-wider text-background">
                                        {cubiculo}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={trocarPpl}
                                    className="flex min-h-[40px] items-center gap-1 rounded border border-border px-3 text-sm hover:bg-secondary"
                                >
                                    <X className="h-4 w-4" /> Trocar PPL
                                </button>
                            </div>

                            {/* Banner última entrega */}
                            <div className="border-b border-border px-4 py-3">
                                {ultimoGlobal ? (
                                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                        trava30
                                            ? 'bg-[#D9381E]/10 text-[#D9381E] border border-[#D9381E]/60'
                                            : 'bg-emerald-50 text-emerald-600 border border-emerald-500/60'
                                    }`}>
                                        {trava30 ? (
                                            <AlertTriangle className="h-4 w-4 shrink-0 text-[#D9381E]" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        )}
                                        <span>
                                            <strong>Última Entrega (Sacola/Sedex):</strong>{' '}
                                            {formatarData(ultimoGlobal.criadoEm)}{' '}
                                            (há {Math.floor(diffDias(ultimoGlobal.criadoEm))} dia(s)) — Tipo:{' '}
                                            <strong>{ultimoGlobal.tipo}</strong>
                                            {trava30 && (
                                                <span className="ml-2 font-semibold text-[#D9381E]">
                                                    · Prazo de 30 dias não atingido!
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>Última Entrega: Nenhum registro anterior localizado.</span>
                                    </div>
                                )}
                            </div>

                            {/* Histórico */}
                            <div className="p-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                                        Histórico de envios
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuantidades({});
                                            setObservacoes({});
                                            setForcado30(false);
                                            if (trava30) {
                                                setModalTrava30(true);
                                            } else {
                                                setModalItens(true);
                                            }
                                        }}
                                        className="flex min-h-[36px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-4 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(255,184,0,0.6)] active:scale-[0.98]"
                                    >
                                        <Package className="h-4 w-4" /> Novo Lançamento
                                    </button>
                                </div>
                                {registrosPpl.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Nenhum envio registrado para este PPL.</p>
                                ) : (
                                    <ul className="flex flex-wrap gap-2">
                                        {registrosPpl.slice(0, 8).map((r) => (
                                            <li key={r.id} className="rounded border border-border bg-muted px-3 py-1.5 text-xs">
                                                <span className="font-semibold">{r.tipo}</span>{' '}
                                                <span className="font-num">{formatarData(r.criadoEm)}</span> ·{' '}
                                                {r.itens?.length || 0} itens
                                                {r.forcado && (
                                                    <span className="ml-1 text-[#0F2232]">(forçado)</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Botão de impressão */}
                        {ultimoSalvo && (
                            <div className="flex items-center gap-4 rounded-xl border border-emerald-500/60 bg-emerald-50 p-4 text-emerald-600">
                                <CheckCircle2 className="h-5 w-5 shrink-0" />
                                <div className="flex-1 text-sm">
                                    <p>
                                        Registro de <strong>{ultimoSalvo.tipo}</strong> salvo em{' '}
                                        {formatarDataHora(ultimoSalvo.criadoEm)}
                                        {ultimoSalvo.forcado ? ' (forçado pelo operador).' : '.'}
                                    </p>
                                    <p className="mt-0.5 text-xs text-emerald-700">Comprovante em 2 vias pronto para impressão.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#D4A237]/60 bg-slate-100 px-5 font-display text-sm font-bold uppercase tracking-wide text-[#0F2232] transition-all hover:bg-[#FFB800]/10 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-[0.98]"
                                >
                                    <Printer className="h-4 w-4" /> Imprimir Comprovante
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ─── Modal Pré-cadastro ─── */}
            {modalPreCadastro && pplPendente && (
                <div className="nao-imprimir modal-overlay bg-foreground/60 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border border-[#D4A237]/40 bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md p-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                                {preEditavel ? 'Cadastro Manual' : 'Confirmar dados do PPL'}
                            </h2>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                                preEditavel
                                    ? 'bg-[#FFB800]/20 text-[#0F2232] border border-[#D4A237]/60'
                                    : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/60'
                            }`}>
                                {preEditavel ? 'Manual' : 'CSV'}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {preEditavel
                                ? 'Preencha todos os campos da ficha manualmente.'
                                : 'Revise os dados automáticos e complete os campos do visitante.'}
                        </p>

                        <div className="mt-4 space-y-4">
                            {/* Prontuário */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Prontuário <span className="text-[#D9381E]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={preProntuario}
                                    onChange={(e) => setPreProntuario(e.target.value)}
                                    readOnly={!preEditavel}
                                    placeholder="Ex: 105450"
                                    className={`w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60 ${
                                        !preEditavel ? 'font-num text-[#0F2232]' : 'font-num'
                                    }`}
                                    autoFocus={preEditavel}
                                />
                            </div>
                            {/* Nome PPL */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Nome do PPL <span className="text-[#D9381E]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={preNomePpl}
                                    onChange={(e) => setPreNomePpl(e.target.value)}
                                    readOnly={!preEditavel}
                                    placeholder="Nome completo do interno..."
                                    className={`w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60 ${
                                        !preEditavel ? 'font-display font-bold' : ''
                                    }`}
                                />
                            </div>
                            {/* Galeria + Cubículo */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Galeria
                                    </label>
                                    <input
                                        type="text"
                                        value={preGaleria}
                                        onChange={(e) => setPreGaleria(e.target.value)}
                                        readOnly={!preEditavel}
                                        placeholder="Ex: B3"
                                        className={`w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60 ${
                                            !preEditavel ? 'text-[#0F2232]' : ''
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Cubículo <span className="text-[#D9381E]">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={preCubiculo}
                                        onChange={(e) => setPreCubiculo(e.target.value)}
                                        readOnly={!preEditavel}
                                        placeholder="Ex: 3309"
                                        className={`w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60 ${
                                            !preEditavel ? 'font-num font-bold text-[#0F2232]' : 'font-num'
                                        }`}
                                    />
                                </div>
                            </div>
                            {/* Cidade */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Cidade
                                </label>
                                <input
                                    type="text"
                                    value={preCidade}
                                    onChange={(e) => setPreCidade(e.target.value)}
                                    placeholder="Ex: Campinas, São Paulo..."
                                    className="w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                            </div>
                            {/* Nome da Visita */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Nome da Visita <span className="text-[#D9381E]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={preNomeVisita}
                                    onChange={(e) => setPreNomeVisita(e.target.value)}
                                    placeholder="Nome completo do visitante..."
                                    className="w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60"
                                />
                            </div>
                            {/* Credencial */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Número da Credencial
                                </label>
                                <input
                                    type="text"
                                    value={preCredencial}
                                    onChange={(e) => setPreCredencial(e.target.value)}
                                    placeholder="Ex: 98765"
                                    className="w-full rounded-lg border border-border bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#D4A237]/60 font-num"
                                />
                            </div>
                            {/* Parentesco */}
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    Grau de Parentesco <span className="text-[#D9381E]">*</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {OPCOES_PARENTESCO.map((op) => (
                                        <button
                                            key={op}
                                            type="button"
                                            onClick={() => {
                                                setPreGrauParentesco(op);
                                                if (op !== 'Outro') setPreGrauOutro('');
                                            }}
                                            className={`min-h-[36px] rounded-lg border px-4 text-sm font-semibold transition-all ${
                                                preGrauParentesco === op
                                                    ? 'border-[#D4A237] bg-[#FFB800]/20 text-[#0F2232]'
                                                    : 'border-border bg-slate-100 text-muted-foreground hover:bg-[#FFB800]/10 hover:text-[#0F2232]'
                                            }`}
                                        >
                                            {op}
                                        </button>
                                    ))}
                                </div>
                                {preGrauParentesco === 'Outro' && (
                                    <input
                                        type="text"
                                        placeholder="Especifique o grau de parentesco..."
                                        value={preGrauOutro}
                                        onChange={(e) => setPreGrauOutro(e.target.value)}
                                        className="mt-2 w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                        autoFocus
                                    />
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalPreCadastro(false);
                                    setPplPendente(null);
                                }}
                                className="min-h-[44px] rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-5 text-sm font-semibold text-[#D9381E] hover:bg-[#D9381E]/10 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarPreCadastro}
                                disabled={!preCadastroValido}
                                className="min-h-[44px] rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-6 font-display text-base font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(255,184,0,0.6)] active:scale-[0.98] disabled:opacity-40"
                            >
                                Confirmar e Iniciar Cadastro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal Trava 30 dias ─── */}
            {modalTrava30 && trava30 && pplAlerta && (
                <div className="nao-imprimir modal-overlay bg-foreground/60 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border border-[#D9381E]/60 bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFB800]/15">
                                <AlertTriangle className="h-6 w-6 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-display text-xl font-bold">
                                    Atenção: Prazo de 30 Dias Não Atingido!
                                </h2>
                                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                    O PPL <strong className="text-foreground">{pplAlerta.nome}</strong> recebeu uma{' '}
                                    <strong className="text-foreground">{trava30.tipo}</strong> no dia{' '}
                                    <strong className="text-foreground">{formatarData(trava30.ultimo)}</strong>{' '}
                                    (há <strong className="text-foreground">{trava30.diasDecorridos} dia(s)</strong>).
                                    O prazo regulamentar de 30 dias para um novo lançamento ainda não expirou.
                                </p>
                                <p className="mt-2 text-sm font-semibold text-[#D9381E]">
                                    Deseja forçar a abertura do formulário e realizar o cadastro assim mesmo?
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalTrava30(false);
                                    setFluxoPendente(null);
                                    setPplPendente(null);
                                    trocarPpl();
                                }}
                                className="min-h-[44px] rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-5 text-sm font-semibold text-[#D9381E] hover:bg-[#D9381E]/10 transition-all"
                            >
                                CANCELAR
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setForcado30(true);
                                    setModalTrava30(false);
                                    if (fluxoPendente) {
                                        abrirEtapaVisita(fluxoPendente.pplBase, fluxoPendente.visitantes);
                                    } else {
                                        setModalItens(true);
                                    }
                                }}
                                className="min-h-[44px] rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                SIM, FORÇAR LANÇAMENTO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal de Itens ─── */}
            {modalItens && ppl && (
                <ModalItens
                    ppl={ppl}
                    tipo={tipo}
                    cubiculo={cubiculo}
                    itens={itens}
                    quantidades={quantidades}
                    setQuantidades={setQuantidades}
                    observacoes={observacoes}
                    setObservacoes={setObservacoes}
                    travasVest={travasVest}
                    carregando={carregando}
                    forcado30={forcado30}
                    alaRestrita={alaRestrita}
                    itensLancados={itens
                        .filter((i) => Number(quantidades[i.id]) > 0)
                        .map((i) => ({ nome: i.nome, categoria: i.categoria, quantidade: Number(quantidades[i.id]) }))}
                    onCancelar={() => {
                        setModalItens(false);
                        setQuantidades({});
                        setObservacoes({});
                    }}
                    onConcluir={salvar}
                />
            )}

            {/* ─── Modal Triagem (alerta com opção de forçar lançamento) ─── */}
            {modalTriagem && pplBloqueado && (
                <div className="nao-imprimir modal-overlay bg-black/70 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border border-[#D9381E] bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D9381E]/10 border border-[#D9381E]/60">
                                <ShieldX className="h-6 w-6 text-[#D9381E]" />
                            </div>
                            <div>
                                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#D9381E]">
                                    Restrição — Ala de Triagem
                                </h2>
                                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                    O PPL <strong className="text-foreground">{pplBloqueado.nome}</strong> (Prontuário:{' '}
                                    <strong className="font-num text-foreground">{pplBloqueado.prontuario}</strong>) encontra-se no cubículo{' '}
                                    <strong className="text-[#D9381E]">{pplBloqueado.cela}</strong> (Ala de Triagem) e está
                                    temporariamente impedido de receber Sedex/Sacola.
                                </p>
                                <p className="mt-2 text-sm font-semibold text-[#D9381E]">
                                    Verifique se há autorização especial da chefia. Deseja forçar o lançamento assim mesmo?
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalTriagem(false);
                                    setPplBloqueado(null);
                                    setFluxoPendente(null);
                                    setPplPendente(null);
                                    setAlaRestrita(null);
                                }}
                                className="min-h-[44px] rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-6 font-display font-bold uppercase tracking-wide text-[#D9381E] hover:bg-[#D9381E]/10 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => forcarLancamentoAla('Triagem')}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 font-display font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <ShieldAlert className="h-4 w-4" /> Forçar Lançamento
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal Castigo (alerta com confirmação) ─── */}
            {modalCastigo && pplBloqueado && (
                <div className="nao-imprimir modal-overlay bg-black/70 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border border-[#D4A237]/60 bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FFB800]/20 border border-[#D4A237]/60">
                                <ShieldAlert className="h-6 w-6 text-[#0F2232]" />
                            </div>
                            <div>
                                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#0F2232]">
                                    Atenção — PPL em Ala de Castigo
                                </h2>
                                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                    O PPL <strong className="text-foreground">{pplBloqueado.nome}</strong> encontra-se no cubículo{' '}
                                    <strong className="text-[#0F2232]">{pplBloqueado.cela}</strong> (Ala de Castigo).
                                    Verifique se há autorização especial da chefia para esta entrega.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalCastigo(false);
                                    setPplBloqueado(null);
                                    setFluxoPendente(null);
                                    setPplPendente(null);
                                    setAlaRestrita(null);
                                }}
                                className="min-h-[44px] rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-5 font-display font-semibold uppercase tracking-wide text-[#D9381E] hover:bg-[#D9381E]/10 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => forcarLancamentoAla('Castigo')}
                                className="min-h-[44px] flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-5 font-display font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <ShieldAlert className="h-4 w-4" /> Forçar Lançamento
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal Bloqueio Absoluto (sanção disciplinar) ─── */}
            {modalBloqueio && bloqueioInfo && (
                <div className="nao-imprimir modal-overlay bg-black/80 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border-2 border-[#D9381E] bg-white p-6 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#D9381E]/10 border-2 border-[#D9381E]/60">
                                <Ban className="h-8 w-8 text-[#D9381E]" />
                            </div>
                            <h2 className="font-display text-2xl font-black uppercase tracking-wide text-[#D9381E]">
                                PPL Impedido de Receber Encomendas
                            </h2>
                        </div>

                        <div className="mt-5 space-y-3 rounded-lg border border-[#D9381E]/40 bg-[#D9381E]/5 p-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">PPL: </span>
                                <strong className="text-foreground">{bloqueioInfo.ppl?.nome || bloqueioInfo.bloqueio.nomePpl}</strong>
                                {' '}
                                <span className="font-num text-muted-foreground">
                                    (Prontuário {bloqueioInfo.ppl?.prontuario || bloqueioInfo.bloqueio.prontuario})
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Motivo: </span>
                                <strong className="text-foreground">{bloqueioInfo.bloqueio.motivo || 'Não informado'}</strong>
                            </div>
                            <div className="font-semibold text-[#D9381E]">
                                Situação: Suspenso por {bloqueioInfo.bloqueio.meses}{' '}
                                {bloqueioInfo.bloqueio.meses === 1 ? 'mês' : 'meses'} — Liberado a partir de{' '}
                                {formatarData(bloqueioInfo.bloqueio.dataLiberacao)}
                                {' '}
                                (Faltam {diasRestantesBloqueio(bloqueioInfo.bloqueio.dataLiberacao)} dias)
                            </div>
                        </div>

                        <p className="mt-4 text-center text-xs text-muted-foreground">
                            Bloqueio absoluto — não é possível forçar o lançamento. A liberação ocorre
                            automaticamente ao expirar o prazo ou mediante remoção manual pelo administrador
                            na aba Configurações.
                        </p>

                        <div className="mt-6 flex justify-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalBloqueio(false);
                                    setBloqueioInfo(null);
                                    setFluxoPendente(null);
                                    setPplPendente(null);
                                    trocarPpl();
                                }}
                                className="flex min-h-[48px] items-center gap-2 rounded-lg border-2 border-[#0F2232] bg-[#0F2232] px-10 font-display text-base font-black uppercase tracking-wide text-white transition-all hover:bg-[#1a3a52] active:scale-[0.98]"
                            >
                                <X className="h-5 w-5" /> Voltar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal Seletor de Visitante ─── */}
            {modalSeletorVisitante && pplPendente && (
                <div className="nao-imprimir modal-overlay bg-black/70 backdrop-blur-sm">
                    <div className="modal-container rounded-xl border border-[#D4A237]/40 bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Users className="h-6 w-6 text-[#0F2232] shrink-0" />
                            <div>
                                <h2 className="font-display text-xl font-bold uppercase tracking-wide">Selecionar Visitante</h2>
                                <p className="text-sm text-muted-foreground">
                                    Selecione o visitante que está entregando a sacola para{' '}
                                    <strong className="text-foreground">{pplPendente.nome}</strong>:
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                            {visitantesDisponiveis.map((v, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        setModalSeletorVisitante(false);
                                        abrirPreCadastro(pplPendente, v, false);
                                    }}
                                    className="w-full rounded-xl border border-[#D4A237]/40 bg-slate-100 hover:bg-[#FFB800]/10 hover:border-[#D4A237]/60 px-4 py-3 text-left transition-all group"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-foreground group-hover:text-[#0F2232] transition-colors">
                                                {v.nomeVisita}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {v.afinidade && <span className="mr-2">{v.afinidade}</span>}
                                                {v.credencial && <span className="font-num">Cred.: {v.credencial}</span>}
                                            </p>
                                        </div>
                                        <span className="rounded-lg border border-[#D4A237]/50 bg-[#FFB800]/10 px-3 py-1 text-xs font-bold text-[#0F2232] uppercase tracking-wide">
                                            Selecionar
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setModalSeletorVisitante(false);
                                    setPplPendente(null);
                                }}
                                className="min-h-[40px] rounded-lg border border-border px-4 text-sm hover:bg-secondary transition-all"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Comprovante registro={ultimoSalvo} />
        </>
    );
}

/* ─── Modal de lançamento de itens ───────────────────────────────────────── */
function ModalItens({
    ppl,
    tipo,
    cubiculo,
    itens,
    quantidades,
    setQuantidades,
    observacoes,
    setObservacoes,
    travasVest,
    carregando,
    forcado30,
    alaRestrita,
    itensLancados,
    onCancelar,
    onConcluir,
}) {
    const inputsRef = useRef([]);

    const setQtd = (id, val) => {
        const n = Math.max(0, parseInt(val, 10) || 0);
        setQuantidades((q) => ({ ...q, [id]: n || '' }));
    };

    // Lista plana de itens na ordem das categorias para navegação por teclado
    // (Tab/Enter) contínua entre todos os campos de quantidade.
    const itensOrdenados = useMemo(
        () => CATEGORIAS.flatMap((cat) => itens.filter((i) => i.categoria === cat)),
        [itens],
    );
    const indiceGlobal = (id) => itensOrdenados.findIndex((i) => i.id === id);

    const focarProximo = (idx) => {
        const next = inputsRef.current[idx + 1];
        if (next) { next.focus(); next.select(); }
    };

    return (
        <div className="nao-imprimir modal-overlay bg-black/60 backdrop-blur-sm">
            <div
                className="modal-container modal-itens rounded-xl border border-[#D4A237]/40 bg-white border-l-4 border-l-[#D4A237] backdrop-blur-md shadow-2xl"
            >

                {/* Header fixo */}
                <div className="modal-header flex items-start justify-between rounded-t-xl bg-slate-100 border-b border-[#D4A237]/40 p-4 text-[#0F2232]">
                    <div>
                        <div className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                                Cadastro de Sacolas e Sedex — {tipo}
                            </h2>
                            {forcado30 && (
                                <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase text-[#0F2232]">
                                    FORÇADO
                                </span>
                            )}
                            {alaRestrita && (
                                <span className="rounded bg-[#D9381E] px-2 py-0.5 text-xs font-bold uppercase text-white">
                                    ALA {alaRestrita}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-sm opacity-90">
                            PPL: <strong>{ppl.nome}</strong> | PRONT: <strong>{ppl.prontuario}</strong>
                            {ppl.galeria ? <> | GALERIA: <strong>{ppl.galeria}</strong></> : null}
                            {cubiculo ? <> | CUBÍCULO: <strong>{cubiculo}</strong></> : null}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancelar}
                        className="ml-4 rounded p-1 opacity-80 hover:opacity-100 hover:bg-white/20"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Corpo — categorias unificadas em grid responsivo (sem abas) */}
                <div className="modal-body p-3 sm:p-4">
                    {carregando ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                                    <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                                    {[1, 2, 3, 4].map((j) => (
                                        <div key={j} className="h-9 animate-pulse rounded bg-muted" />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                            {CATEGORIAS.map((cat, catIdx) => {
                                const lista = itens.filter((i) => i.categoria === cat);
                                const rotulos = ['1. Alimentação', '2. Higiene e Limpeza', '3. Vestuário'];
                                return (
                                    <section
                                        key={cat}
                                        className="flex flex-col rounded-lg border border-[#D4A237]/40 bg-white/70 overflow-hidden"
                                    >
                                        {/* Cabeçalho do bloco */}
                                        <header className="flex items-center justify-between gap-2 border-b border-[#D4A237]/40 bg-slate-100 px-3 py-2">
                                            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-[#0F2232]">
                                                {rotulos[catIdx] ?? cat}
                                            </h3>
                                            <span className="rounded-full bg-[#FFB800]/20 px-2 py-0.5 font-num text-[11px] font-semibold text-[#0F2232]">
                                                {lista.length} itens
                                            </span>
                                        </header>

                                        {/* Lista compacta de itens */}
                                        <ul className="divide-y divide-border">
                                            {lista.length === 0 && (
                                                <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                                                    Nenhum item ativo nesta categoria.
                                                </li>
                                            )}
                                            {lista.map((item) => {
                                                const idx = indiceGlobal(item.id);
                                                const bloqueio = travasVest[item.nome];
                                                const qty = Number(quantidades[item.id] ?? 0);
                                                return (
                                                    <li
                                                        key={item.id}
                                                        className={`item-linha ${bloqueio ? 'bg-[#D9381E]/10' : ''}`}
                                                    >
                                                        <div className="item-nome">
                                                            <p className="font-medium">{item.nome}</p>
                                                            {bloqueio && (
                                                                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#D9381E]">
                                                                    <Lock className="h-3 w-3" />
                                                                    Bloqueado até {formatarData(bloqueio.liberaEm)}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="item-controles">
                                                            <button
                                                                type="button"
                                                                onClick={() => setQtd(item.id, qty - 1)}
                                                                className="btn-qtd rounded border border-border bg-background text-muted-foreground hover:bg-secondary active:scale-95"
                                                                tabIndex={-1}
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                            </button>
                                                            <input
                                                                ref={(el) => { inputsRef.current[idx] = el; }}
                                                                inputMode="numeric"
                                                                type="number"
                                                                min="0"
                                                                value={quantidades[item.id] ?? ''}
                                                                onChange={(e) => setQtd(item.id, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        focarProximo(idx);
                                                                    } else if (e.key === 'ArrowDown') {
                                                                        e.preventDefault();
                                                                        const next = inputsRef.current[idx + 1];
                                                                        if (next) { next.focus(); next.select(); }
                                                                    } else if (e.key === 'ArrowUp') {
                                                                        e.preventDefault();
                                                                        const prev = inputsRef.current[idx - 1];
                                                                        if (prev) { prev.focus(); prev.select(); }
                                                                    }
                                                                }}
                                                                className={`input-qtd font-num rounded border bg-background outline-none focus:ring-2 focus:ring-primary/40 ${
                                                                    bloqueio ? 'border-[#D9381E]' : 'border-border'
                                                                }`}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setQtd(item.id, qty + 1)}
                                                                className="btn-qtd rounded border border-border bg-background text-muted-foreground hover:bg-secondary active:scale-95"
                                                                tabIndex={-1}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        {/* Observações da categoria */}
                                        <div className="mt-auto border-t border-border p-2">
                                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                                Observações — {rotulos[catIdx]?.replace(/^\d+\.\s*/, '') ?? cat}
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={observacoes[cat] || ''}
                                                onChange={(e) => setObservacoes((o) => ({ ...o, [cat]: e.target.value }))}
                                                className="obs-area w-full rounded border border-border bg-background p-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Rodapé fixo */}
                <div className="modal-footer flex items-center justify-between gap-3 border-t border-[#D4A237]/40 bg-slate-100 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                        <span className="font-num text-lg font-semibold text-foreground">{itensLancados.length}</span> itens ·{' '}
                        <span className="font-num font-semibold text-foreground">
                            {itensLancados.reduce((s, i) => s + i.quantidade, 0)}
                        </span>{' '}
                        unidades
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onCancelar}
                            className="min-h-[44px] rounded-lg border border-[#D9381E]/60 bg-[#D9381E]/10 px-5 font-display text-sm font-semibold uppercase tracking-wide text-[#D9381E] hover:bg-[#D9381E]/10 transition-all"
                        >
                            CANCELAR
                        </button>
                        <button
                            type="button"
                            onClick={onConcluir}
                            disabled={itensLancados.length === 0}
                            className="min-h-[44px] flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FFB800] via-[#FFC940] to-[#E5A700] px-6 font-display text-sm font-black uppercase tracking-wide text-[#0F2232] shadow-[0_0_15px_rgba(255,184,0,0.45)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(255,184,0,0.6)] active:scale-[0.98] disabled:opacity-40"
                        >
                            <Printer className="h-4 w-4" /> CONCLUIR E GERAR NOTA
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
