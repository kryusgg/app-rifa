import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase'; // <-- Note que removemos o Storage daqui!
import { Trash2, AlertCircle, Check, Users, Grid, Lock, Clock, ShieldCheck, User, Upload, Image as ImageIcon } from 'lucide-react';

export default function App() {
  // --- CREDENCIAIS DE ADMINISTRADOR ---
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "123456";

  const [activeTab, setActiveTab] = useState('grid'); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState(false);

  // --- CHAVE DA API DO IMGBB ---
  const IMGBB_API_KEY = "9481e5acecaabb8232eb2420285f7b2b"; // <--- COLE SUA CHAVE AQUI

  // --- ESTADOS DA RIFA E UPLOAD ---
  const [tickets, setTickets] = useState({});
  const [name, setName] = useState('');
  const [selectedInput, setSelectedInput] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [overlapError, setOverlapError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const TOTAL_NUMBERS = 1000;

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

  const approvedCount = Object.values(tickets).filter(t => t.status === 'approved').length;
  const pendingCount = Object.values(tickets).filter(t => t.status === 'pending').length;
  const availableCount = TOTAL_NUMBERS - (approvedCount + pendingCount);
  const progressPercent = ((approvedCount + pendingCount) / TOTAL_NUMBERS) * 100;

  const selectedNumbers = useMemo(() => {
    return selectedInput.split(',').map(n => n.trim()).filter(n => n !== '' && !isNaN(n)).map(Number).filter(n => n >= 1 && n <= TOTAL_NUMBERS);
  }, [selectedInput]);

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

  useEffect(() => {
    const conflicts = selectedNumbers.filter(num => tickets[num]);
    if (conflicts.length > 0) {
      setOverlapError(`Atenção: Os números ${conflicts.join(', ')} já estão reservados ou vendidos!`);
    } else {
      setOverlapError('');
    }
  }, [selectedNumbers, tickets]);

  const handleNumberClick = (num) => {
    if (tickets[num]) return; 
    let currentSelected = [...selectedNumbers];
    if (currentSelected.includes(num)) currentSelected = currentSelected.filter(n => n !== num);
    else currentSelected.push(num);
    setSelectedInput(currentSelected.join(', '));
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setReceiptFile(e.target.files[0]);
    }
  };

  // --- NOVA FUNÇÃO COM IMGBB ---
  const handleRequestReservation = async (e) => {
    e.preventDefault();
    if (!name.trim() || selectedNumbers.length === 0 || overlapError) return;

    setIsUploading(true);
    try {
      let uploadedReceiptUrl = null;

      // Se o usuário selecionou uma imagem, fazemos o upload via ImgBB API
      if (receiptFile) {
        const formData = new FormData();
        formData.append('image', receiptFile);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        
        if (result.success) {
          uploadedReceiptUrl = result.data.url; // Pega o link público gerado pelo ImgBB
        } else {
          console.error("Erro no ImgBB:", result);
          alert("Aviso: Não foi possível enviar a imagem do comprovante, mas a reserva continuará.");
        }
      }

      // Salva no banco de dados atual (Firestore) com o link da imagem
      const batch = writeBatch(db);
      selectedNumbers.forEach(num => {
        const docRef = doc(db, "rifa_numeros", String(num));
        batch.set(docRef, {
          owner: name.trim(),
          status: 'pending',
          receiptUrl: uploadedReceiptUrl, 
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      setName('');
      setSelectedInput('');
      setReceiptFile(null);
      
      const fileInput = document.getElementById('receipt-upload');
      if (fileInput) fileInput.value = "";
      
      alert("Sua reserva foi solicitada com sucesso! Aguarde a confirmação do administrador.");
    } catch (error) {
      console.error("Erro ao solicitar:", error);
      alert("Erro ao enviar. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleApprovePerson = async (personNumbers) => {
    try {
      const batch = writeBatch(db);
      personNumbers.forEach(num => {
        batch.update(doc(db, "rifa_numeros", String(num)), { status: 'approved' });
      });
      await batch.commit();
    } catch (error) {
      console.error("Erro ao aprovar:", error);
    }
  };

  const handleDeleteSingle = async (num) => {
    if (window.confirm(`Tem certeza que deseja excluir o número ${num}?`)) {
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
        console.error("Erro ao excluir:", error);
      }
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-sans">Carregando dados...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex-1 w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Sorteio Online</h1>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex flex-col items-center bg-red-50 border border-red-100 px-3 py-2 rounded-xl min-w-[90px]">
                <span className="text-red-500 text-[10px] font-bold uppercase tracking-wider mb-1">Confirmados</span>
                <span className="text-red-700 text-xl font-black">{approvedCount}</span>
              </div>
              <div className="flex flex-col items-center bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-xl min-w-[90px]">
                <span className="text-yellow-600 text-[10px] font-bold uppercase tracking-wider mb-1">Pendentes</span>
                <span className="text-yellow-700 text-xl font-black">{pendingCount}</span>
              </div>
              <div className="flex flex-col items-center bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl min-w-[90px]">
                <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider mb-1">Livres</span>
                <span className="text-emerald-700 text-xl font-black">{availableCount}</span>
              </div>
            </div>
            <div className="w-full max-w-md bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200 flex">
              <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: `${(approvedCount / TOTAL_NUMBERS) * 100}%` }}></div>
              <div className="bg-yellow-400 h-full transition-all duration-1000" style={{ width: `${(pendingCount / TOTAL_NUMBERS) * 100}%` }}></div>
            </div>
            <p className="text-xs text-gray-400 mt-2 font-medium">{progressPercent.toFixed(1)}% reservado/vendido</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto justify-center">
            <button onClick={() => setActiveTab('grid')} className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'grid' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              <Grid size={18} /> Comprar
            </button>
            <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${activeTab === 'admin' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              <ShieldCheck size={18} /> Administração
            </button>
          </div>
        </div>

        {/* ABA COMPRAR NÚMEROS */}
        {activeTab === 'grid' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Reserve seus Números</h2>
                <form onSubmit={handleRequestReservation} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Seu Nome Completo</label>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} disabled={isUploading} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: João Silva" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Números Escolhidos</label>
                    <input type="text" required value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)} disabled={isUploading} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 42, 15" />
                  </div>
                  
                  {/* UPLOAD DE COMPROVANTE IMGBB */}
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors">
                    <input 
                      type="file" 
                      id="receipt-upload"
                      accept="image/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                      disabled={isUploading}
                    />
                    <label htmlFor="receipt-upload" className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload size={24} className={receiptFile ? "text-emerald-500" : "text-gray-400"} />
                      <span className="text-sm font-medium text-gray-700 truncate w-full px-2">
                        {receiptFile ? receiptFile.name : "Anexar Comprovante (Pix)"}
                      </span>
                      <span className="text-xs text-gray-400">Opcional. Apenas imagens.</span>
                    </label>
                  </div>

                  {overlapError && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex gap-2"><AlertCircle size={16} />{overlapError}</div>}

                  <button type="submit" disabled={!name.trim() || selectedNumbers.length === 0 || overlapError || isUploading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
                    {isUploading ? "Enviando imagem..." : <><Clock size={18} /> Solicitar Reserva</>}
                  </button>
                </form>
              </div>
            </div>

            {/* GRADE */}
            <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-4 mb-4 text-xs font-medium text-gray-500 justify-center sm:justify-start">
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-white border border-gray-300"></span> Livre</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></span> Reservado</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></span> Vendido</div>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((num) => {
                  const data = tickets[num];
                  const isPending = data?.status === 'pending';
                  const isApproved = data?.status === 'approved';
                  const isSelected = selectedNumbers.includes(num);
                  return (
                    <button key={num} onClick={() => handleNumberClick(num)} disabled={isPending || isApproved} className={`h-12 rounded-lg text-sm font-medium transition-all duration-200 border relative overflow-hidden ${isApproved ? 'bg-red-50 border-red-200 text-red-600 cursor-not-allowed' : isPending ? 'bg-yellow-50 border-yellow-300 text-yellow-700 cursor-not-allowed' : isSelected ? 'bg-blue-600 border-blue-600 text-white transform scale-105' : 'bg-white border-gray-200 hover:bg-blue-50'}`}>
                      {num}
                      {isApproved && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-[1px] bg-red-400 rotate-45"></div></div>}
                      {isPending && <Clock size={12} className="absolute top-1 right-1 opacity-50" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ABA ADMIN */}
        {activeTab === 'admin' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            {!isAuthenticated ? (
              <div className="max-w-sm mx-auto py-12">
                <div className="flex justify-center mb-6"><div className="bg-gray-100 p-4 rounded-full text-gray-600"><Lock size={32} /></div></div>
                <h2 className="text-xl font-bold text-center text-gray-800 mb-6">Acesso Administrativo</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <input type="text" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="Usuário" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-gray-500" />
                  <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Senha" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-gray-500" />
                  {loginError && <p className="text-red-500 text-sm text-center font-medium">Credenciais inválidas!</p>}
                  <button type="submit" className="w-full bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 rounded-lg transition-colors">Acessar Painel</button>
                </form>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-8 pb-4 border-b">
                  <h2 className="text-xl font-bold text-gray-800">Painel de Controle</h2>
                  <button onClick={() => setIsAuthenticated(false)} className="text-sm text-gray-500 hover:text-red-500">Sair do Painel</button>
                </div>

                {/* PENDENTES */}
                <div className="mb-10">
                  <h3 className="text-lg font-bold text-yellow-700 flex items-center gap-2 mb-4"><Clock size={20} /> Reservas Pendentes</h3>
                  {Object.keys(pendingGroups).length === 0 ? (
                    <p className="text-gray-500 text-sm italic bg-gray-50 p-4 rounded-lg border border-dashed">Nenhuma reserva pendente.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(pendingGroups).map(([owner, data]) => (
                        <div key={`pend-${owner}`} className="border border-yellow-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-yellow-50/50">
                          <div>
                            <h4 className="font-bold text-gray-800 flex items-center gap-2"><User size={16}/> {owner}</h4>
                            
                            {/* Link do Comprovante (ImgBB) */}
                            {data.receiptUrl && (
                              <a href={data.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-2 bg-blue-50 px-3 py-1 rounded-full font-medium transition-colors border border-blue-100">
                                <ImageIcon size={14} /> Ver Comprovante Anexado
                              </a>
                            )}

                            <div className="flex flex-wrap gap-2 mt-3">
                              {data.nums.sort((a, b) => a - b).map(n => (
                                <div key={n} className="inline-flex items-center gap-1 bg-white border border-yellow-300 px-2 py-1 rounded text-sm font-medium text-yellow-700 group">
                                  <span>#{n}</span>
                                  <button onClick={() => handleDeleteSingle(n)} className="text-gray-400 hover:text-red-500 ml-1 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleApprovePerson(data.nums)} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"><Check size={16} /> Confirmar</button>
                            <button onClick={() => handleDeletePerson(owner, data.nums)} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /> Excluir</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* APROVADOS */}
                <div>
                  <h3 className="text-lg font-bold text-emerald-700 flex items-center gap-2 mb-4"><ShieldCheck size={20} /> Números Confirmados</h3>
                  {Object.keys(approvedGroups).length === 0 ? (
                    <p className="text-gray-500 text-sm italic bg-gray-50 p-4 rounded-lg border border-dashed">Nenhum número confirmado ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(approvedGroups).map(([owner, data]) => (
                        <div key={`appr-${owner}`} className="border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                          <div>
                            <h4 className="font-bold text-gray-800 flex items-center gap-2"><User size={16}/> {owner}</h4>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {data.nums.sort((a, b) => a - b).map(n => (
                                <div key={n} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 px-2 py-1 rounded text-sm font-medium text-gray-600 group">
                                  <span>#{n}</span>
                                  <button onClick={() => handleDeleteSingle(n)} className="text-gray-400 hover:text-red-500 ml-1 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <button onClick={() => handleDeletePerson(owner, data.nums)} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"><Trash2 size={16} /> Cancelar Venda</button>
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
    </div>
  );
}