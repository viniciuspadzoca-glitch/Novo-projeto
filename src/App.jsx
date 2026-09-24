import React, { useEffect } from 'react';
import { Route, Routes, BrowserRouter as Router } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import InstallPrompt from './components/InstallPrompt';
import Layout from './components/Layout';
import RegistroPage from './pages/RegistroPage';
import HistoricoPage from './pages/HistoricoPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import { inicializarSincronizacao } from './lib/firebase';

function App() {
    // Inicia a sincronização em tempo real com o Firebase Realtime Database.
    // O ouvinte onValue() mescla mudanças remotas no IndexedDB; a UI reativa
    // (liveQuery) atualiza a tela em todos os dispositivos sem recarregar.
    useEffect(() => {
        const cancelar = inicializarSincronizacao();
        return () => cancelar && cancelar();
    }, []);

    return (
        <Router>
            <ScrollToTop />
            <Layout>
                <InstallPrompt />
                <Routes>
                    <Route path="/" element={<RegistroPage />} />
                    <Route path="/historico" element={<HistoricoPage />} />
                    <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                </Routes>
            </Layout>
        </Router>
    );
}

export default App;
