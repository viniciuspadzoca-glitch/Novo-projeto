import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { getPplUnicosDaBase } from '@/lib/db';

export default function BuscaPpl({ onSelecionar, autoFocus = false }) {
    const [termo, setTermo] = useState('');
    const [ppls, setPpls] = useState([]);
    const [aberto, setAberto] = useState(false);
    const [destaque, setDestaque] = useState(0);
    const boxRef = useRef(null);

    useEffect(() => {
        getPplUnicosDaBase().then(setPpls);
    }, []);

    useEffect(() => {
        const fora = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setAberto(false);
        };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    const resultados = useMemo(() => {
        const t = termo.trim().toLowerCase();
        if (t.length < 2) return [];
        return ppls
            .filter(
                (p) =>
                    String(p.prontuario).toLowerCase().includes(t) ||
                    String(p.nome).toLowerCase().includes(t),
            )
            .slice(0, 8);
    }, [termo, ppls]);

    const escolher = (p) => {
        onSelecionar(p);
        setTermo('');
        setAberto(false);
    };

    const teclas = (e) => {
        if (!resultados.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setDestaque((d) => (d + 1) % resultados.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setDestaque((d) => (d - 1 + resultados.length) % resultados.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            escolher(resultados[destaque] || resultados[0]);
        }
    };

    return (
        <div ref={boxRef} className="relative">
            <div className="flex items-center gap-2 rounded border border-border bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/40">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                    autoFocus={autoFocus}
                    value={termo}
                    onChange={(e) => {
                        setTermo(e.target.value);
                        setAberto(true);
                        setDestaque(0);
                    }}
                    onFocus={() => setAberto(true)}
                    onKeyDown={teclas}
                    placeholder="Buscar PPL por prontuário ou nome..."
                    className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </div>
            {aberto && termo.trim().length >= 2 && (
                <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded border border-border bg-card shadow-lg">
                    {resultados.length === 0 && (
                        <li className="px-3 py-3 text-sm text-muted-foreground">
                            Nenhum PPL encontrado. Importe o CSV na aba Base de PPL.
                        </li>
                    )}
                    {resultados.map((p, i) => (
                        <li key={p.prontuario}>
                            <button
                                type="button"
                                onMouseEnter={() => setDestaque(i)}
                                onClick={() => escolher(p)}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                                    i === destaque ? 'bg-secondary' : ''
                                }`}
                            >
                                <span className="font-medium">{p.nome}</span>
                                <span className="font-num text-xs text-muted-foreground">
                                    {p.prontuario} · Bloco {p.bloco || '—'}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
