import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, History, Settings, Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react';
import { onSyncStatus } from '@/lib/firebase';
const links = [{
  to: '/',
  label: 'Cadastro',
  icon: ClipboardList
}, {
  to: '/historico',
  label: 'Histórico',
  icon: History
}, {
  to: '/configuracoes',
  label: 'Configurações',
  icon: Settings
}];
export default function Layout({
  children
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    const off = onSyncStatus(setSynced);
    return () => off && off();
  }, []);
  return <div className="flex min-h-[100dvh] flex-col bg-background text-foreground" style={{
    background: '#F1F5F9'
  }}>
            <header className="nao-imprimir sticky top-0 z-40 border-b-2 border-[#D4A237] shadow-lg" style={{
      background: 'radial-gradient(ellipse at center, #2b2b2b 0%, #1c1c1c 55%, #000000 100%)',
      boxShadow: '0 0 24px rgba(212,162,55,0.35), 0 10px 30px -10px rgba(0,0,0,0.8)'
    }}>
                <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
                    <div className="flex items-center gap-4">
                        <img src="https://horizons-cdn.hostinger.com/ff411dd5-b9f8-4710-b3a2-2b05dd6a1cab/images-kYZnF.jfif" alt="Brasão PCE-US" className="h-20 w-20 shrink-0 object-contain bg-transparent" style={{
            filter: 'drop-shadow(0 0 10px rgba(212,162,55,0.45))'
          }} />
                        <div className="leading-tight">
                            <p className="font-display text-lg font-bold uppercase tracking-wide text-[#FFB800]">
                                CADASTRO DE SACOLAS E SEDEX
                            </p>
                            <p className="text-[11px] uppercase tracking-widest text-slate-300">
                                Registro de sacolas e sedex — Complexo Penitenciário
                            </p>
                        </div>
                    </div>
                    <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-2 md:w-auto md:overflow-visible">
                        {links.map(({
            to,
            label,
            icon: Icon
          }) => <NavLink key={to} to={to} end={to === '/'} className={({
            isActive
          }) => `flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all whitespace-nowrap md:flex-none ${isActive ? 'bg-[#FFB800] text-[#0F2232] border border-[#D4A237]' : 'text-slate-200 hover:bg-white/10 hover:text-[#FFB800]'}`}>
                                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                                <span className="hidden sm:inline">{label}</span>
                            </NavLink>)}
                    </nav>
                    <div className="ml-auto flex items-center gap-3 text-xs font-medium text-slate-200">
                        <span className="flex items-center gap-1" title="Sincronização em tempo real com Firebase Realtime Database">
                            {synced ? <>
                                <Cloud className="h-4 w-4 text-[#FFB800]" /> <span className="text-[#FFB800]">Sincronizado</span>
                            </> : <>
                                <CloudOff className="h-4 w-4 text-slate-400" /> <span className="text-slate-400">Sync offline</span>
                            </>}
                        </span>
                        {online ? <>
                                <Wifi className="h-4 w-4 text-emerald-400" /> <span className="text-emerald-400">Online</span>
                            </> : <>
                                <WifiOff className="h-4 w-4 text-[#D9381E]" /> <span className="text-[#D9381E]">Offline — dados salvos localmente</span>
                            </>}
                    </div>
                </div>
            </header>
            <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-4 py-6">{children}</main>
        </div>;
}