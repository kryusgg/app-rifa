import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase'; 
import { Trash2, AlertCircle, Check, Users, Grid, Lock } from 'lucide-react';

export default function App() {
  // --- SISTEMA DE SENHA ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  const SENHA_CORRETA = "sthe123"; // <--- MUDE SUA SENHA AQUI

  // --- ESTADOS DA RIFA ---
  const [activeTab, setActiveTab] = useState('grid');
  const [tickets, setTickets] = useState({});
  const [name, setName] = useState('');
  const [selectedInput, setSelectedInput] = useState('');
  const [overlapError, setOverlapError] = useState('');
  const [loading, setLoading] = useState(true);

  const TOTAL_NUMBERS = 1000;

  // Carregar dados do Firestore em tempo real (Só carrega se estiver autenticado)
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = onSnapshot(collection(db, "rifa_numeros"), (snapshot) => {
      const loadedTickets = {};
      snapshot.forEach((doc) => {
        loadedTickets[doc.id] = doc.data();
      });
      setTickets(loadedTickets);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Função de Login
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === SENHA_CORRETA) {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  // Processa o input de texto para extrair números válidos
  const selectedNumbers = useMemo(() => {
    return selectedInput
      .split(',')
      .map(n => n.trim())
      .filter(n => n !== '' && !isNaN(n))
      .map(Number)
      .filter(n => n >= 1 && n <= TOTAL_NUMBERS);
  }, [selectedInput]);

  // Agrupa os tickets vendidos por dono para a aba de lista
  const groupedTickets = useMemo(() => {
    const groups = {};
    Object.entries(tickets).forEach(([num, data]) => {
      if (!groups[data.owner]) groups[data.owner] = [];
      groups[data.owner].push(Number(num));
    });
    return groups;
  }, [tickets]);

  // Verifica se há sobreposição sempre que a seleção ou os tickets mudam
  useEffect(() => {
    const conflicts = selectedNumbers.filter(num => tickets[num]);
    if (conflicts.length > 0) {
      setOverlapError(`Atenção: Os números ${conflicts.join(', ')} já estão vendidos!`);
    } else {
      setOverlapError('');
    }
  }, [selectedNumbers, tickets]);

  const handleNumberClick = (num) => {
    if (tickets[num]) return; // Ignora se já estiver vendido

    let currentSelected = [...selectedNumbers];
    if (currentSelected.includes(num)) {
      currentSelected = currentSelected.filter(n => n !== num);
    } else {
      currentSelected.push(num);
    }
    setSelectedInput(currentSelected.join(', '));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || selectedNumbers.length === 0 || overlapError) return;

    try {
      const batch = writeBatch(db);
      
      selectedNumbers.forEach(num => {
        const docRef = doc(db, "rifa_numeros", String(num));
        batch.set(docRef, {
          owner: name.trim(),
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      setName('');
      setSelectedInput('');
    } catch (error) {
      console.error("Erro ao salvar no Firestore:", error);
      alert("Erro ao salvar. Verifique se configurou o Firestore corretamente no painel.");
    }
  };

  const handleDeleteSingle = async (num) => {
    if (window.confirm(`Tem certeza que deseja excluir o número ${num}? Ele voltará a ficar disponível.`)) {
      try {
        await deleteDoc(doc(db, "rifa_numeros", String(num)));
      } catch (error) {
        console.error("Erro ao excluir:", error);
      }
    }
  };

  const handleDeletePerson = async (ownerName, personNumbers) => {
    if (window.confirm(`Deseja excluir TODOS os números de ${ownerName}?`)) {
      try {
        const batch = writeBatch(db);
        personNumbers.forEach(num => {
          batch.delete(doc(db, "rifa_numeros", String(num)));
        });
        await batch.commit();
      } catch (error) {
        console.error("Erro ao excluir números da pessoa:", error);
      }
    }
  };

  // --- TELA DE LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-md border border-gray-100 max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full text-blue-600">
              <Lock size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Acesso Restrito</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-center text-lg tracking-widest"
              />
            </div>
            {loginError && <p className="text-red-500 text-sm text-center font-medium">Senha incorreta!</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- TELA PRINCIPAL (CARREGANDO) ---
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-sans">Carregando dados da rifa...</div>;
  }

  // --- TELA PRINCIPAL DA RIFA ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Gerenciador de Rifa</h1>
            <p className="text-gray-500">{Object.keys(tickets).length} de {TOTAL_NUMBERS} números vendidos</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('grid')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'grid' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Grid size={18} /> Painel
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'list' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Users size={18} /> Vendidos
              </button>
            </div>
            <button 
              onClick={() => setIsAuthenticated(false)}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Sair
            </button>
          </div>
        </div>

        {activeTab === 'grid' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Formulário */}
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Atribuir Números</h2>
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Pessoa</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Ex: João Silva"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Números Escolhidos</label>
                    <input
                      type="text"
                      required
                      value={selectedInput}
                      onChange={(e) => setSelectedInput(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Ex: 42, 15, 99"
                    />
                    <p className="text-xs text-gray-500 mt-1">Digite separados por vírgula ou clique na grade.</p>
                  </div>
                  
                  {overlapError && (
                    <div className="flex items-start gap-2 bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-100">
                      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                      <p>{overlapError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!name.trim() || selectedNumbers.length === 0 || overlapError}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> Salvar Venda
                  </button>
                </form>
              </div>
            </div>

            {/* Grade de Números */}
            <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                  const isSold = tickets[num];
                  const isSelected = selectedNumbers.includes(num);
                  
                  return (
                    <button
                      key={num}
                      onClick={() => handleNumberClick(num)}
                      disabled={isSold}
                      className={`
                        h-12 rounded-lg text-sm font-medium transition-all duration-200 border relative
                        ${isSold 
                          ? 'bg-red-50 border-red-200 text-red-500 cursor-not-allowed opacity-60' 
                          : isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md transform scale-105'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50'}
                      `}
                    >
                      {num}
                      {isSold && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-[1px] bg-red-400 rotate-45 transform origin-center"></div></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-gray-800">Gerenciamento de Vendas</h2>
            {Object.keys(groupedTickets).length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Nenhum número vendido ainda.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedTickets).map(([owner, nums]) => (
                  <div key={owner} className="border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg">{owner}</h3>
                      <p className="text-sm text-gray-500 mb-2">Total de números: {nums.length}</p>
                      <div className="flex flex-wrap gap-2">
                        {nums.sort((a, b) => a - b).map(n => (
                          <div key={n} className="inline-flex items-center gap-1 bg-white border border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-700 shadow-sm group">
                            <span>#{n}</span>
                            <button 
                              onClick={() => handleDeleteSingle(n)}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded-full hover:bg-red-50 transition-colors ml-1 opacity-0 group-hover:opacity-100"
                              title="Excluir este número"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDeletePerson(owner, nums)}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                      Excluir Tudo
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}