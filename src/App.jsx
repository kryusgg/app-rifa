import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase'; 
import { Trash2, AlertCircle, Check, Users, Lock, Clock, ShieldCheck, User, Upload, Image as ImageIcon, ChevronRight, X, Copy, CheckCircle2 } from 'lucide-react';

export default function App() {
  // --- CREDENCIAIS DE ADMINISTRADOR ---
  const ADMIN_USER = "doce metade";
  const ADMIN_PASS = "sthe123@";

  // --- CONFIGURAÇÕES DA RIFA ---
  const TOTAL_NUMBERS = 1000;
  const IMGBB_API_KEY = "9481e5acecaabb8232eb2420285f7b2b"; // <--- CHAVE IMGBB
  const BG_IMAGE = "https://ibb.co/Vp9DZ9Qh"; // <--- LINK DA IMAGEM DE FUNDO
  
  // ---> DADOS DE PAGAMENTO <---
  const CHAVE_PIX = "078.250.614.38"; // <--- COLOQUE SUA CHAVE PIX AQUI
  const NOME_PIX = "Stephany Camilla Castelar"; // <--- SEU NOME NO PIX
  const PRECO_NUMERO = 2.00; // <--- PREÇO DE CADA NÚMERO (Ex: 5 reais)

  // --- ESTADOS DO SISTEMA ---
  const [activeTab, setActiveTab] = useState('grid'); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState(false);

  // --- ESTADOS DA RIFA ---
  const [tickets, setTickets] = useState({});
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS DO FLUXO DE COMPRA (MODAL) ---
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1: Nome, 2: Pix e Comprovante, 3: Sucesso
  const [customerName, setCustomerName] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "rifa_numeros"), (snapshot) => {
      const loadedTickets = {};
      snapshot.forEach((doc) => {
        loadedTickets[doc.id] = doc.data();
      });
      setTickets(loadedTickets);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginUser === ADMIN_USER && loginPass === ADMIN_PASS) {
      setIsAuthenticated(true);
      setLoginError(false);
      setLoginUser('');
      setLoginPass('');
    } else {
      setLoginError(true);
    }
  };

  const copyPix = () => {
    navigator.clipboard.writeText(CHAVE_PIX);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const approvedCount = Object.values(tickets).filter(t => t.status === 'approved').length;
  const pendingCount = Object.values(tickets).filter(t => t.status === 'pending').length;
  const availableCount = TOTAL_NUMBERS - (approvedCount + pendingCount);
  const progressPercent = ((approvedCount + pendingCount) / TOTAL_NUMBERS) * 100;

  const { pendingGroups, approvedGroups } = useMemo(() => {
    const pGroups = {};
    const aGroups = {};
    Object.entries(tickets).forEach(([numStr, data]) => {
      const num = Number(numStr);
      if (data.status === 'pending') {
        if (!pGroups[data.owner]) pGroups[data.owner] = { nums: [], receiptUrl: data.receiptUrl || null };
        pGroups[data.owner].nums.push(num);
        if (data.receiptUrl && !pGroups[data.owner].receiptUrl) pGroups[data.owner].receiptUrl = data.receiptUrl;
      } else {
        if (!aGroups[data.owner]) aGroups[data.owner] = { nums: [] };
        aGroups[data.owner].nums.push(num);
      }
    });
    return { pendingGroups: pGroups, approvedGroups: aGroups };
  }, [tickets]);

  // Função para selecionar números na grade principal
  const handleNumberClick = (num) => {
    if (tickets[num]) return; // Bloqueia clicar em vendidos/pendentes
    
    setSelectedNumbers(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num);
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) setReceiptFile(e.target.files[0]);
  };

  const closeCheckout = () => {
    setIsModalOpen(false);
    setCheckoutStep(1);
    // Não apagamos customerName nem receiptFile aqui para ele não perder os dados se fechar sem querer
  };

  const startCheckout = () => {
    if (selectedNumbers.length > 0) setIsModalOpen(true);
  };

  const finalizeReservation = async () => {
    if (!customerName.trim() || selectedNumbers.length === 0) return;

    // Dupla checagem para evitar sobreposição na hora H
    const conflicts = selectedNumbers.filter(num => tickets[num]);
    if (conflicts.length > 0) {
      alert(`Desculpe, os números ${conflicts.join(', ')} acabaram de ser reservados por outra pessoa. Por favor, escolha outros.`);
      closeCheckout();
      setSelectedNumbers(prev => prev.filter(n => !conflicts.includes(n)));
      return;
    }

    setIsUploading(true);
    try {
      let uploadedReceiptUrl = null;

      if (receiptFile) {
        const formData = new FormData();
        formData.append('image', receiptFile);
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData,
        });
        const result = await response.json();
        if (result.success) uploadedReceiptUrl = result.data.url; 
      }

      const batch = writeBatch(db);
      selectedNumbers.forEach(num => {
        const docRef = doc(db, "rifa_numeros", String(num));
        batch.set(docRef, {
          owner: customerName.trim(),
          status: 'pending',
          receiptUrl: uploadedReceiptUrl, 
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      
      // Sucesso! Vai para a etapa 3 (Sucesso)
      setCheckoutStep(3);
      setSelectedNumbers([]);
      setCustomerName('');
      setReceiptFile(null);
      
    } catch (error) {
      console.error("Erro ao solicitar:", error);
      alert("Erro ao enviar a reserva. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  // Funções Admin
  const handleApprovePerson = async (personNumbers) => {
    try {
      const batch = writeBatch(db);
      personNumbers.forEach(num => {
        batch.update(doc(db, "rifa_numeros", String(num)), { status: 'approved' });
      });
      await batch.commit();
    } catch (error) { console.error("Erro:", error); }
  };

  const handleDeleteSingle = async (num) => {
    if (window.confirm(`Excluir o número ${num}?`)) {
      try { await deleteDoc(doc(db, "rifa_numeros", String(num))); } 
      catch (error) { console.error("Erro:", error); }
    }
  };

  const handleDeletePerson = async (ownerName, personNumbers) => {
    if (window.confirm(`Excluir TODOS os números de ${ownerName}?`)) {
      try {
        const batch = writeBatch(db);
        personNumbers.forEach(num => batch.delete(doc(db, "rifa_numeros", String(num))));
        await batch.commit();
      } catch (error) { console.error("Erro:", error); }
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-sans">Carregando dados...</div>;

  return (
    <div className="min-h-screen font-sans bg-cover bg-center bg-fixed relative pb-24" style={{ backgroundImage: `url('${BG_IMAGE}')` }}>
      <div className="absolute inset-0 bg-black/50 fixed"></div>

      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 relative z-10 p-4 md:p-8">
        
        {/* CABEÇALHO COMPACTO */}
        <div className="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-2xl shadow-lg border border-white/20">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left w-full">
              <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-3">Sorteio Online</h1>
              
              {/* Contadores menores para celular */}
              <div className="flex justify-center md:justify-start gap-2 mb-3">
                <div className="bg-red-50 border border-red-100 px-2 py-1 rounded-lg text-center flex-1 md:flex-none md:min-w-[80px]">
                  <span className="block text-red-500 text-[9px] font-bold uppercase tracking-wider">Vendidos</span>
                  <span className="text-red-700 text-lg font-black leading-tight">{approvedCount}</span>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 px-2 py-1 rounded-lg text-center flex-1 md:flex-none md:min-w-[80px]">
                  <span className="block text-yellow-600 text-[9px] font-bold uppercase tracking-wider">Pendentes</span>
                  <span className="text-yellow-700 text-lg font-black leading-tight">{pendingCount}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg text-center flex-1 md:flex-none md:min-w-[80px]">
                  <span className="block text-emerald-500 text-[9px] font-bold uppercase tracking-wider">Livres</span>
                  <span className="text-emerald-700 text-lg font-black leading-tight">{availableCount}</span>
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden flex shadow-inner">
                <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: `${(approvedCount / TOTAL_NUMBERS) * 100}%` }}></div>
                <div className="bg-yellow-400 h-full transition-all duration-1000" style={{ width: `${(pendingCount / TOTAL_NUMBERS) * 100}%` }}></div>
              </div>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-lg w-full md:w-auto shadow-sm">
              <button onClick={() => {setActiveTab('grid'); setSelectedNumbers([]);}} className={`flex-1 flex justify-center items-center gap-1 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'grid' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                 Comprar
              </button>
              <button onClick={() => setActiveTab('admin')} className={`flex-1 flex justify-center items-center gap-1 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'admin' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                <ShieldCheck size={16} /> Admin
              </button>
            </div>
          </div>
        </div>

        {/* ABA COMPRAR NÚMEROS (Apenas a Grade) */}
        {activeTab === 'grid' && (
          <div className="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-2xl shadow-lg border border-white/20">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Escolha seus números</h2>
              <p className="text-xs text-gray-500">Toque nos números livres para selecionar.</p>
            </div>

            <div className="flex items-center justify-center gap-4 mb-4 text-[10px] font-medium text-gray-700">
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-white border border-gray-300"></span> Livre</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></span> Reservado</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></span> Vendido</div>
            </div>

            {/* Grelha mais compacta para mobile */}
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5 md:gap-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar pb-20">
              {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                const data = tickets[num];
                const isPending = data?.status === 'pending';
                const isApproved = data?.status === 'approved';
                const isSelected = selectedNumbers.includes(num);
                return (
                  <button key={num} onClick={() => handleNumberClick(num)} disabled={isPending || isApproved} 
                    className={`h-10 md:h-12 rounded-md text-xs md:text-sm font-medium transition-all duration-200 border relative overflow-hidden flex items-center justify-center
                    ${isApproved ? 'bg-red-50 border-red-200 text-red-500/50 cursor-not-allowed shadow-inner' : 
                      isPending ? 'bg-yellow-50 border-yellow-200 text-yellow-600/50 cursor-not-allowed shadow-inner' : 
                      isSelected ? 'bg-blue-600 border-blue-600 text-white transform scale-105 shadow-md z-10' : 
                      'bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50 shadow-sm'}`}>
                    {num}
                    {isApproved && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-[1px] bg-red-300 rotate-45"></div></div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ABA ADMIN (Mantida igual ao anterior, focada no gestor) */}
        {activeTab === 'admin' && (
          <div className="bg-white/95 backdrop-blur-sm p-4 md:p-6 rounded-2xl shadow-lg border border-white/20">
            {/* ... Todo o código do admin que enviei na resposta anterior permanece inalterado aqui ... */}
             {!isAuthenticated ? (
              <div className="max-w-sm mx-auto py-12">
                <div className="flex justify-center mb-6"><div className="bg-gray-100 p-4 rounded-full text-gray-600 shadow-inner"><Lock size={32} /></div></div>
                <h2 className="text-xl font-bold text-center text-gray-800 mb-6">Acesso Administrativo</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <input type="text" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="Usuário" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-gray-500 shadow-sm" />
                  <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Senha" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-gray-500 shadow-sm" />
                  {loginError && <p className="text-red-500 text-sm text-center font-medium">Credenciais inválidas!</p>}
                  <button type="submit" className="w-full bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 rounded-lg transition-colors shadow-md">Acessar Painel</button>
                </form>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-800">Painel de Controle</h2>
                  <button onClick={() => setIsAuthenticated(false)} className="text-sm text-gray-500 hover:text-red-500 font-medium">Sair</button>
                </div>

                <div className="mb-8">
                  <h3 className="text-base font-bold text-yellow-700 flex items-center gap-2 mb-3"><Clock size={18} /> Reservas Pendentes</h3>
                  {Object.keys(pendingGroups).length === 0 ? (
                    <p className="text-gray-500 text-sm italic bg-white p-3 rounded-lg border border-dashed border-gray-300">Nenhuma reserva pendente.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(pendingGroups).map(([owner, data]) => (
                        <div key={`pend-${owner}`} className="border border-yellow-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-yellow-50/80 shadow-sm">
                          <div>
                            <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1"><User size={14}/> {owner}</h4>
                            {data.receiptUrl && (
                              <a href={data.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 mt-1 bg-blue-50 px-2 py-1 rounded-full font-medium transition-colors border border-blue-100">
                                <ImageIcon size={12} /> Ver Comprovante
                              </a>
                            )}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {data.nums.sort((a, b) => a - b).map(n => (
                                <div key={n} className="inline-flex items-center gap-1 bg-white border border-yellow-300 px-1.5 py-0.5 rounded text-xs font-medium text-yellow-700 group shadow-sm">
                                  <span>#{n}</span>
                                  <button onClick={() => handleDeleteSingle(n)} className="text-gray-400 hover:text-red-500 ml-1"><Trash2 size={12} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleApprovePerson(data.nums)} className="flex-1 flex justify-center items-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-md hover:bg-emerald-600"><Check size={14} /> Confirmar</button>
                            <button onClick={() => handleDeletePerson(owner, data.nums)} className="flex justify-center items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-md"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-emerald-700 flex items-center gap-2 mb-3"><ShieldCheck size={18} /> Confirmados</h3>
                  {Object.keys(approvedGroups).length === 0 ? (
                    <p className="text-gray-500 text-sm italic bg-white p-3 rounded-lg border border-dashed border-gray-300">Nenhum número confirmado.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(approvedGroups).map(([owner, data]) => (
                        <div key={`appr-${owner}`} className="border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white shadow-sm">
                          <div>
                            <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1"><User size={14}/> {owner}</h4>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {data.nums.sort((a, b) => a - b).map(n => (
                                <div key={n} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-xs font-medium text-gray-600 group shadow-sm">
                                  <span>#{n}</span>
                                  <button onClick={() => handleDeleteSingle(n)} className="text-gray-400 hover:text-red-500 ml-1"><Trash2 size={12} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => handleDeletePerson(owner, data.nums)} className="flex justify-center items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:text-red-600 shrink-0"><Trash2 size={14} /> Cancelar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

      </div>

      {/* --- BARRA FLUTUANTE INFERIOR (Mobile e Desktop) --- */}
      {activeTab === 'grid' && selectedNumbers.length > 0 && !isModalOpen && (
        <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 z-40 animate-slideUp">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Você escolheu</p>
              <p className="text-lg font-bold text-blue-600">{selectedNumbers.length} número{selectedNumbers.length > 1 ? 's' : ''}</p>
            </div>
            <button onClick={startCheckout} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all transform active:scale-95">
              Continuar <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DE CHECKOUT (Jornada por Etapas) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slideUpBottom">
            
            {/* Header do Modal */}
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 text-lg">Finalizar Reserva</h3>
              {checkoutStep !== 3 && (
                <button onClick={closeCheckout} className="text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1"><X size={20} /></button>
              )}
            </div>

            {/* Conteúdo Dinâmico por Etapa */}
            <div className="p-6 overflow-y-auto">
              
              {/* ETAPA 1: Identificação */}
              {checkoutStep === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 text-sm">
                    <span className="font-bold">Números selecionados:</span> {selectedNumbers.join(', ')}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Para quem é a reserva?</label>
                    <input 
                      type="text" 
                      required 
                      value={customerName} 
                      onChange={(e) => setCustomerName(e.target.value)} 
                      className="w-full p-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base transition-all" 
                      placeholder="Digite seu Nome e Sobrenome" 
                      autoFocus
                    />
                  </div>
                  <button 
                    onClick={() => setCheckoutStep(2)} 
                    disabled={!customerName.trim()} 
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors mt-6"
                  >
                    Próximo Passo <ChevronRight size={18} />
                  </button>
                </div>
              )}

              {/* ETAPA 2: Pagamento e Comprovante */}
              {checkoutStep === 2 && (
                <div className="space-y-5 animate-fadeIn">
                  
                  {/* Resumo do Valor */}
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-center">
                    <p className="text-sm text-gray-500 font-medium mb-1">Total a pagar</p>
                    <p className="text-3xl font-black text-green-600">R$ {(selectedNumbers.length * PRECO_NUMERO).toFixed(2).replace('.', ',')}</p>
                    <p className="text-xs text-gray-400 mt-1">({selectedNumbers.length}x R$ {PRECO_NUMERO.toFixed(2).replace('.', ',')})</p>
                  </div>

                  {/* Instruções Pix */}
                  <div className="border border-green-200 rounded-xl p-4 bg-green-50/50">
                    <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                      1. Pague via Pix
                    </p>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center">
                      <div className="truncate pr-2">
                        <p className="text-xs text-gray-500">Chave ({NOME_PIX})</p>
                        <p className="font-mono text-sm text-gray-800 truncate select-all">{CHAVE_PIX}</p>
                      </div>
                      <button onClick={copyPix} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1 shrink-0 transition-colors">
                        {copiedPix ? <Check size={14} className="text-green-600"/> : <Copy size={14}/>} 
                        {copiedPix ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Anexo */}
                  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
                    <p className="text-sm font-bold text-gray-800 mb-2">2. Envie o Comprovante (Opcional)</p>
                    <input type="file" id="receipt-upload" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading}/>
                    <label htmlFor="receipt-upload" className="cursor-pointer border-2 border-dashed border-blue-300 bg-white rounded-lg p-3 flex items-center justify-center gap-3 hover:bg-blue-50 transition-colors">
                      <div className="bg-blue-100 p-2 rounded-full text-blue-600"><Upload size={18} /></div>
                      <div className="flex-1 overflow-hidden">
                        <span className="text-sm font-medium text-gray-700 block truncate">
                          {receiptFile ? receiptFile.name : "Toque para anexar a imagem"}
                        </span>
                        <span className="text-xs text-gray-400 block">Agiliza a sua aprovação.</span>
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setCheckoutStep(1)} disabled={isUploading} className="px-4 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors">Voltar</button>
                    <button onClick={finalizeReservation} disabled={isUploading} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-600/30">
                      {isUploading ? "Enviando..." : <><CheckCircle2 size={18} /> Concluir Reserva</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ETAPA 3: Sucesso */}
              {checkoutStep === 3 && (
                <div className="text-center py-6 animate-fadeIn">
                  <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={40} strokeWidth={3} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">Sucesso!</h3>
                  <p className="text-gray-600 mb-6">
                    Seus <b>{selectedNumbers.length} números</b> foram reservados para <b>{customerName}</b>.
                    O administrador irá verificar o pagamento e confirmar a sua compra em breve.
                  </p>
                  <button onClick={closeCheckout} className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3.5 rounded-xl transition-colors">
                    Voltar para a Rifa
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Adicionar animações no CSS global (Tailwind purista via classes utilitárias) */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideUpBottom { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideUpBottom { animation: slideUpBottom 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-in forwards; }
      `}} />
    </div>
  );
}