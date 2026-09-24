import { useEffect, useState } from 'react';

/**
 * Captura o evento beforeinstallprompt do navegador e oferece um botão
 * explícito de instalação do PWA. Quando o critério de instalabilidade é
 * atendido (manifest válido + service worker + HTTPS + ícones 192/512),
 * o navegador dispara o evento e este botão aparece no canto da tela.
 */
export default function InstallPrompt() {
    const [deferred, setDeferred] = useState(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setDeferred(e);
            setVisible(true);
        };
        const installed = () => {
            setDeferred(null);
            setVisible(false);
        };
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', installed);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installed);
        };
    }, []);

    if (!visible || !deferred) return null;

    const instalar = async () => {
        deferred.prompt();
        try {
            await deferred.userChoice;
        } finally {
            setDeferred(null);
            setVisible(false);
        }
    };

    const fechar = () => setVisible(false);

    return (
        <div
            className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl border border-amber-400/60 bg-[#0F2232] px-4 py-3 shadow-2xl"
            role="dialog"
            aria-label="Instalar aplicativo"
        >
            <div className="flex flex-col">
                <span className="font-display text-sm font-semibold text-amber-400">
                    Instalar aplicativo
                </span>
                <span className="text-xs text-slate-300">
                    Adicione à tela inicial para uso offline
                </span>
            </div>
            <button
                onClick={instalar}
                className="rounded-lg bg-[#FFB800] px-3 py-1.5 text-sm font-semibold text-[#0F2232] transition-transform active:scale-95"
            >
                Instalar
            </button>
            <button
                onClick={fechar}
                aria-label="Fechar"
                className="text-slate-400 transition-colors hover:text-white"
            >
                ✕
            </button>
        </div>
    );
}
