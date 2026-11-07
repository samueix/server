import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  Code, 
  Archive, 
  File, 
  Search, 
  ArrowUp, 
  ArrowDown, 
  LayoutGrid, 
  List, 
  RefreshCw, 
  CornerLeftUp, 
  ChevronRight, 
  Eye, 
  Copy, 
  Check, 
  X, 
  AlertCircle, 
  HardDrive,
  Info,
  Calendar,
  Layers,
  FileCode,
  ShieldAlert,
  FilePlus,
  Edit3,
  Save
} from 'lucide-react';
import { FileItem, FileExplorerResponse, FileReadResponse } from '../../types';
import { fetchDirectory, fetchFileContent, createFile, saveFile } from '../../services/fileService';

type SortField = 'name' | 'date' | 'size' | 'type';
type SortDirection = 'asc' | 'desc';

export const FilesTab: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('/home/samuel');
  const [data, setData] = useState<FileExplorerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Ordenação
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Modal de Leitura / Edição de Arquivo (Bloco de Notas)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<FileReadResponse | null>(null);
  const [readingFile, setReadingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copiedContent, setCopiedContent] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Modal de Criação de Novo Arquivo (Bloco de Notas)
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('notas.txt');
  const [newFileContent, setNewFileContent] = useState<string>('');
  const [creatingFile, setCreatingFile] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadFolder = async (targetPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDirectory(targetPath);
      setData(res);
      setCurrentPath(res.currentPath);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar o diretório.');
      // Se falhar (ex: /home/samuel não existir), tenta raiz /
      if (targetPath !== '/') {
        try {
          const fallbackRes = await fetchDirectory('/');
          setData(fallbackRes);
          setCurrentPath(fallbackRes.currentPath);
          setError(null);
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolder(currentPath);
  }, []);

  const handleOpenItem = (item: FileItem) => {
    if (item.isDirectory) {
      loadFolder(item.path);
    } else {
      handleReadFile(item);
    }
  };

  const handleGoUp = () => {
    if (data?.parentPath) {
      loadFolder(data.parentPath);
    }
  };

  const handleReadFile = async (item: FileItem) => {
    setSelectedFile(item);
    setReadingFile(true);
    setFileError(null);
    setFileContent(null);
    setCopiedContent(false);

    try {
      const contentRes = await fetchFileContent(item.path);
      setFileContent(contentRes);
      setEditedText(contentRes.content || '');
      setIsEditing(false);
    } catch (err: any) {
      setFileError(err.message || 'Não foi possível ler o arquivo.');
    } finally {
      setReadingFile(false);
    }
  };

  const handleCopyFileContent = () => {
    const textToCopy = isEditing ? editedText : fileContent?.content;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const handleStartEdit = () => {
    if (fileContent && !fileContent.isBinary) {
      setEditedText(fileContent.content);
      setIsEditing(true);
    }
  };

  const handleSaveFileEdit = async () => {
    if (!selectedFile) return;
    setSavingEdit(true);
    setFileError(null);
    try {
      await saveFile(selectedFile.path, editedText);
      setFileContent(prev => prev ? { ...prev, content: editedText } : null);
      setIsEditing(false);
      setActionNotice(`Arquivo "${selectedFile.name}" salvo com sucesso!`);
      setTimeout(() => setActionNotice(null), 3500);
      loadFolder(currentPath);
    } catch (err: any) {
      setFileError(err.message || 'Erro ao salvar alterações no arquivo.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFile(true);
    setCreateError(null);
    try {
      await createFile(currentPath, newFileName, newFileContent);
      setIsCreatingModalOpen(false);
      setNewFileName('notas.txt');
      setNewFileContent('');
      setActionNotice(`Arquivo "${newFileName}" criado com sucesso!`);
      setTimeout(() => setActionNotice(null), 3500);
      loadFolder(currentPath);
    } catch (err: any) {
      setCreateError(err.message || 'Falha ao criar arquivo.');
    } finally {
      setCreatingFile(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtragem e Ordenação
  const processedItems = useMemo(() => {
    if (!data?.items) return [];

    let list = [...data.items];

    // Busca
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(item => 
        item.name.toLowerCase().includes(term) ||
        (item.extension && item.extension.toLowerCase().includes(term))
      );
    }

    // Ordenação
    list.sort((a, b) => {
      // Pastas sempre vêm antes
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      } else if (sortField === 'date') {
        comparison = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
      } else if (sortField === 'size') {
        comparison = a.size - b.size;
      } else if (sortField === 'type') {
        comparison = (a.extension || '').localeCompare(b.extension || '');
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [data?.items, searchTerm, sortField, sortDirection]);

  // Breadcrumb parts
  const breadcrumbParts = useMemo(() => {
    if (!currentPath) return [];
    if (currentPath === '/') return [{ name: 'Raiz (/)', path: '/' }];

    const segments = currentPath.split('/').filter(Boolean);
    const parts = [{ name: 'Raiz (/)', path: '/' }];
    let accPath = '';

    for (const seg of segments) {
      accPath += `/${seg}`;
      parts.push({ name: seg, path: accPath });
    }

    return parts;
  }, [currentPath]);

  // Ícone e Cor por tipo de arquivo (estilo exato do mockup enviado pelo usuário)
  const renderItemVisual = (item: FileItem) => {
    if (item.isDirectory) {
      return (
        <div className="w-12 h-12 rounded-xl bg-[#FFF1D6] border-2 border-[#1A1A2E] flex items-center justify-center text-[#FFB020] shadow-[2px_2px_0px_#1A1A2E]">
          <Folder className="w-6 h-6 fill-[#FFB020] text-[#1A1A2E]" />
        </div>
      );
    }

    switch (item.typeCategory) {
      case 'image':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#E0F2FE] border-2 border-[#1A1A2E] flex items-center justify-center text-[#00A6FB] shadow-[2px_2px_0px_#1A1A2E]">
            <ImageIcon className="w-6 h-6" />
          </div>
        );
      case 'video':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#EBE9FE] border-2 border-[#1A1A2E] flex items-center justify-center text-[#7F56D9] shadow-[2px_2px_0px_#1A1A2E]">
            <Video className="w-6 h-6" />
          </div>
        );
      case 'audio':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#FEE4E2] border-2 border-[#1A1A2E] flex items-center justify-center text-[#F04438] shadow-[2px_2px_0px_#1A1A2E]">
            <Music className="w-6 h-6" />
          </div>
        );
      case 'code':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#D1FADF] border-2 border-[#1A1A2E] flex items-center justify-center text-[#12B76A] shadow-[2px_2px_0px_#1A1A2E]">
            <Code className="w-6 h-6" />
          </div>
        );
      case 'archive':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#FEF0C7] border-2 border-[#1A1A2E] flex items-center justify-center text-[#B54708] shadow-[2px_2px_0px_#1A1A2E]">
            <Archive className="w-6 h-6" />
          </div>
        );
      case 'document':
        return (
          <div className="w-12 h-12 rounded-xl bg-[#FEF6EE] border-2 border-[#1A1A2E] flex items-center justify-center text-[#FF5A36] shadow-[2px_2px_0px_#1A1A2E]">
            <FileText className="w-6 h-6" />
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-[#1A1A2E] flex items-center justify-center text-[#4A4A68] shadow-[2px_2px_0px_#1A1A2E]">
            <File className="w-6 h-6" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-4 font-sans text-[#1A1A2E]">
      {/* Top Header Card */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFC857] border-2 border-[#1A1A2E] flex items-center justify-center text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] shrink-0">
            <Folder className="w-6 h-6 fill-[#FFC857]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-[#1A1A2E] font-title">Arquivos do Ubuntu</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#ECFDF3] border border-[#12B76A] text-[#12B76A]">
                <span className="w-2 h-2 rounded-full bg-[#12B76A]" />
                Somente Leitura
              </span>
            </div>
            <p className="text-xs text-[#4A4A68] font-medium mt-0.5">
              Navegue pelas pastas e visualize arquivos do sistema Ubuntu sem risco de alteração.
            </p>
          </div>
        </div>

        {/* Quick Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold font-title uppercase tracking-wider text-[#717188] hidden sm:inline">
            Atalhos:
          </span>
          <button
            onClick={() => loadFolder('/home/samuel')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              currentPath === '/home/samuel' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]'
            }`}
          >
            /home/samuel
          </button>
          <button
            onClick={() => loadFolder('/var/log')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              currentPath === '/var/log' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]'
            }`}
          >
            /var/log
          </button>
          <button
            onClick={() => loadFolder('/etc')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              currentPath === '/etc' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]'
            }`}
          >
            /etc
          </button>
          <button
            onClick={() => loadFolder('/opt')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              currentPath === '/opt' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]'
            }`}
          >
            /opt
          </button>
          <button
            onClick={() => loadFolder('/')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border-2 border-[#1A1A2E] transition shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              currentPath === '/' ? 'bg-[#FF5A36] text-white' : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E]'
            }`}
          >
            / (Raiz)
          </button>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-3 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-0 text-xs font-mono font-bold">
          <button
            onClick={handleGoUp}
            disabled={!data?.parentPath}
            className="p-1.5 rounded-lg border-2 border-[#1A1A2E] bg-[#FFF7E8] hover:bg-[#FFC857] disabled:opacity-40 disabled:cursor-not-allowed shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
            title="Subir um nível (pasta pai)"
          >
            <CornerLeftUp className="w-4 h-4 text-[#1A1A2E]" />
          </button>

          <span className="text-[#717188] px-1 font-sans text-xs">Caminho:</span>

          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {breadcrumbParts.map((part, idx) => (
              <React.Fragment key={part.path}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#717188] shrink-0" />}
                <button
                  onClick={() => loadFolder(part.path)}
                  className={`px-2 py-0.5 rounded border transition truncate shrink-0 ${
                    part.path === currentPath
                      ? 'bg-[#FF5A36] text-white border-[#1A1A2E] font-black'
                      : 'bg-[#FFF7E8] hover:bg-[#FFEECB] text-[#1A1A2E] border-transparent font-medium'
                  }`}
                >
                  {part.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setNewFileName('notas.txt');
              setNewFileContent('');
              setCreateError(null);
              setIsCreatingModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] bg-[#FF5A36] hover:bg-[#E04522] text-white text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Criar novo arquivo de texto / bloco de notas"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Bloco de Notas</span>
            <span className="sm:hidden">Criar</span>
          </button>

          <button
            onClick={() => loadFolder(currentPath)}
            disabled={loading}
            className="p-1.5 rounded-lg border-2 border-[#1A1A2E] bg-white hover:bg-[#FFF7E8] text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
            title="Atualizar pasta"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Aviso de Ação Concluída */}
      {actionNotice && (
        <div className="p-3 bg-[#D1FADF] border-2 border-[#12B76A] rounded-xl text-[#12B76A] font-bold text-xs flex items-center justify-between shadow-[2px_2px_0px_#12B76A]">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#12B76A]" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-xs font-mono underline hover:text-[#1A1A2E]">
            Fechar
          </button>
        </div>
      )}

      {/* Filter and Controls Toolbar (Estilo idêntico ao mockup da foto: Nome, Data, Tamanho, Tipo) */}
      <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Sort Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-mono font-bold text-[#717188] mr-1 hidden md:inline">Ordenar:</span>
          
          <button
            onClick={() => toggleSort('name')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] text-xs font-mono font-bold transition shadow-[2px_2px_0px_#1A1A2E] ${
              sortField === 'name' ? 'bg-[#00A6FB] text-white' : 'bg-white hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <span>Nome</span>
            {sortField === 'name' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
          </button>

          <button
            onClick={() => toggleSort('date')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] text-xs font-mono font-bold transition shadow-[2px_2px_0px_#1A1A2E] ${
              sortField === 'date' ? 'bg-[#00A6FB] text-white' : 'bg-white hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <span>Data</span>
            {sortField === 'date' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
          </button>

          <button
            onClick={() => toggleSort('size')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] text-xs font-mono font-bold transition shadow-[2px_2px_0px_#1A1A2E] ${
              sortField === 'size' ? 'bg-[#00A6FB] text-white' : 'bg-white hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <span>Tamanho</span>
            {sortField === 'size' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
          </button>

          <button
            onClick={() => toggleSort('type')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#1A1A2E] text-xs font-mono font-bold transition shadow-[2px_2px_0px_#1A1A2E] ${
              sortField === 'type' ? 'bg-[#00A6FB] text-white' : 'bg-white hover:bg-[#FFF7E8] text-[#1A1A2E]'
            }`}
          >
            <span>Tipo</span>
            {sortField === 'type' && (sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
          </button>
        </div>

        {/* Search Input & View Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-[#717188] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar arquivos..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] placeholder-[#717188] focus:outline-none focus:ring-2 focus:ring-[#FF5A36] shadow-[2px_2px_0px_#1A1A2E]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#717188] hover:text-[#1A1A2E]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center border-2 border-[#1A1A2E] rounded-lg overflow-hidden shadow-[2px_2px_0px_#1A1A2E]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition ${viewMode === 'grid' ? 'bg-[#FF5A36] text-white' : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'}`}
              title="Visualização em Grade (Cards)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition border-l-2 border-[#1A1A2E] ${viewMode === 'list' ? 'bg-[#FF5A36] text-white' : 'bg-white text-[#1A1A2E] hover:bg-[#FFF7E8]'}`}
              title="Visualização em Lista detalhada"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-[#FEF3F2] border-2 border-[#F04438] shadow-[4px_4px_0px_#F04438] rounded-xl p-4 text-[#1A1A2E] text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#F04438] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[#F04438] font-title text-sm">Falha ao ler diretório</div>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Directory Summary Info */}
      {data && (
        <div className="flex items-center justify-between text-xs font-mono text-[#717188] px-1 font-bold">
          <span>
            {data.totalFolders} pasta(s), {data.totalFiles} arquivo(s)
            {searchTerm && ` (${processedItems.length} resultado(s) filtrado(s))`}
          </span>
          <span>Tamanho total: {data.totalSizeFormatted}</span>
        </div>
      )}

      {/* Content Area: Grid View or List View */}
      {loading ? (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-[#FF5A36] animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono font-bold text-[#717188]">Lendo diretório no Ubuntu Server...</p>
        </div>
      ) : processedItems.length === 0 ? (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl p-12 text-center">
          <Folder className="w-12 h-12 text-[#717188] mx-auto mb-3 stroke-[1.5]" />
          <h3 className="text-sm font-bold font-title text-[#1A1A2E]">Diretório vazio</h3>
          <p className="text-xs text-[#717188] mt-1 font-mono">
            {searchTerm ? 'Nenhum arquivo corresponde ao termo pesquisado.' : 'Esta pasta não contém arquivos legíveis.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (Inspirada no mockup da imagem do usuário com cards grandes e ícones destacados) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {processedItems.map((item) => (
            <div
              key={item.path}
              onClick={() => handleOpenItem(item)}
              className="group bg-white border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] hover:shadow-[5px_5px_0px_#1A1A2E] hover:-translate-y-0.5 rounded-xl p-3.5 flex flex-col items-center text-center cursor-pointer transition select-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              title={item.name}
            >
              {/* Visual Icon */}
              <div className="mb-2.5 transition group-hover:scale-105">
                {renderItemVisual(item)}
              </div>

              {/* Name */}
              <span className="text-xs font-bold font-mono text-[#1A1A2E] truncate w-full group-hover:text-[#FF5A36] transition">
                {item.name}
              </span>

              {/* Subtitle / Details */}
              <span className="text-[10px] font-mono text-[#717188] font-bold mt-1">
                {item.isDirectory ? 'Pasta' : item.sizeFormatted}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono text-[#1A1A2E]">
              <thead className="bg-[#FFF7E8] text-[#1A1A2E] border-b-2 border-[#1A1A2E] font-black text-xs">
                <tr>
                  <th className="py-2.5 px-3.5">Nome</th>
                  <th className="py-2.5 px-3.5">Tipo</th>
                  <th className="py-2.5 px-3.5 text-right">Tamanho</th>
                  <th className="py-2.5 px-3.5 text-right">Modificado em</th>
                  <th className="py-2.5 px-3.5 text-center">Permissões</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DFD8]">
                {processedItems.map((item) => (
                  <tr
                    key={item.path}
                    onClick={() => handleOpenItem(item)}
                    className="hover:bg-[#FFF7E8]/70 transition cursor-pointer"
                  >
                    <td className="py-2.5 px-3.5 flex items-center gap-2.5 max-w-md">
                      <div className="shrink-0">
                        {item.isDirectory ? (
                          <Folder className="w-4 h-4 fill-[#FFB020] text-[#1A1A2E]" />
                        ) : (
                          <FileText className="w-4 h-4 text-[#FF5A36]" />
                        )}
                      </div>
                      <span className="font-bold text-[#1A1A2E] truncate">{item.name}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-[#717188] font-bold">
                      {item.isDirectory ? 'Pasta' : (item.extension || 'Arquivo')}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-black tabular-nums">
                      {item.isDirectory ? '--' : item.sizeFormatted}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-[#717188] tabular-nums">
                      {new Date(item.mtime).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3.5 text-center text-[#717188]">
                      <span className="bg-[#FFF7E8] px-1.5 py-0.5 rounded border border-[#1A1A2E] text-[10px] font-bold">
                        {item.permissions || '0755'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Visualização de Arquivo (Somente Leitura) */}
      {selectedFile && (
        <div className="fixed inset-0 bg-[#1A1A2E]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCode className="w-5 h-5 text-[#FF5A36] shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-[#1A1A2E] font-title truncate">
                      {selectedFile.name}
                    </h3>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                      isEditing 
                        ? 'bg-[#FEF0C7] text-[#B54708] border-[#F79009]' 
                        : 'bg-[#ECFDF3] text-[#12B76A] border-[#12B76A]'
                    }`}>
                      {isEditing ? 'Bloco de Notas (Editando)' : 'Somente Leitura'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#717188] block truncate">
                    {selectedFile.path}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {fileContent && !fileContent.isBinary && (
                  <>
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleSaveFileEdit}
                          disabled={savingEdit}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#12B76A] hover:bg-[#0E9355] text-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
                          title="Salvar alterações no arquivo"
                        >
                          <Save className={`w-3.5 h-3.5 ${savingEdit ? 'animate-spin' : ''}`} />
                          <span>{savingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          disabled={savingEdit}
                          className="px-2.5 py-1.5 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleStartEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5A36] hover:bg-[#E04522] text-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                        title="Editar conteúdo no bloco de notas"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    )}

                    <button
                      onClick={handleCopyFileContent}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#FFC857] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                      title="Copiar conteúdo"
                    >
                      {copiedContent ? <Check className="w-3.5 h-3.5 text-[#12B76A]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{copiedContent ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setIsEditing(false);
                  }}
                  className="p-1.5 bg-white hover:bg-[#FEE4E2] border-2 border-[#1A1A2E] rounded-lg text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  title="Fechar visualizador"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto bg-[#1A1A2E] text-[#FFF7E8] font-mono text-xs">
              {readingFile ? (
                <div className="py-16 text-center text-[#FFF7E8]/70">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF5A36]" />
                  <span>Carregando arquivo...</span>
                </div>
              ) : fileError ? (
                <div className="p-4 bg-[#F04438]/20 border border-[#F04438] rounded-lg text-[#FEE4E2]">
                  <strong className="block mb-1">Erro:</strong>
                  {fileError}
                </div>
              ) : fileContent?.isBinary ? (
                <div className="py-12 text-center space-y-2">
                  <Info className="w-8 h-8 text-[#FFC857] mx-auto" />
                  <p className="font-bold text-white">{fileContent.content}</p>
                </div>
              ) : isEditing ? (
                <div className="h-full flex flex-col space-y-2">
                  <div className="text-[11px] text-[#FFC857] font-bold">
                    📝 Editando no Bloco de Notas: digite abaixo e clique em "Salvar Alterações".
                  </div>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full h-80 min-h-[300px] p-3 bg-black/40 border-2 border-[#FFEECB]/30 rounded-lg text-[#FFF7E8] font-mono text-xs leading-relaxed focus:outline-none focus:border-[#FF5A36] resize-y selection:bg-[#FF5A36]"
                    placeholder="Conteúdo do arquivo..."
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  {fileContent?.truncated && (
                    <div className="mb-3 p-2 rounded bg-[#FFC857]/20 border border-[#FFC857] text-[#FFC857] text-[11px]">
                      ⚠️ Arquivo muito extenso. Exibindo os primeiros 512 KB em modo de leitura seguro.
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap break-all leading-relaxed selection:bg-[#FF5A36] selection:text-white">
                    {fileContent?.content}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[#FFF7E8] border-t-2 border-[#1A1A2E] flex items-center justify-between text-[11px] font-mono font-bold text-[#717188]">
              <span>Tamanho: {selectedFile.sizeFormatted}</span>
              <span>Modificado em: {new Date(selectedFile.mtime).toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo Arquivo (Bloco de Notas) */}
      {isCreatingModalOpen && (
        <div className="fixed inset-0 bg-[#1A1A2E]/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] rounded-xl w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-[#FFF7E8] border-b-2 border-[#1A1A2E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-[#FF5A36]" />
                <h3 className="text-sm font-black text-[#1A1A2E] font-title">
                  Criar Novo Arquivo (Bloco de Notas)
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingModalOpen(false)}
                className="p-1 hover:bg-[#FEE4E2] rounded border-2 border-transparent hover:border-[#1A1A2E]"
              >
                <X className="w-4 h-4 text-[#1A1A2E]" />
              </button>
            </div>

            <form onSubmit={handleCreateNewFile} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 bg-[#FEE4E2] border-2 border-[#F04438] rounded-lg text-[#F04438] text-xs font-bold">
                  {createError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                  Diretório de destino:
                </label>
                <input
                  type="text"
                  disabled
                  value={currentPath}
                  className="w-full p-2 bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#717188] select-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                  Nome do arquivo (ex: lembrete.txt, script.sh, notas.md):
                </label>
                <input
                  type="text"
                  required
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="anotacoes.txt"
                  className="w-full p-2.5 bg-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-mono font-bold text-[#1A1A2E]">
                  Conteúdo inicial (opcional):
                </label>
                <textarea
                  rows={6}
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="Escreva suas anotações ou script aqui..."
                  className="w-full p-3 bg-[#FFF7E8]/50 border-2 border-[#1A1A2E] rounded-lg text-xs font-mono text-[#1A1A2E] focus:outline-none focus:border-[#FF5A36] focus:shadow-[2px_2px_0px_#FF5A36] resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-[#1A1A2E]/10">
                <button
                  type="button"
                  onClick={() => setIsCreatingModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-[#FFF7E8] border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold text-[#1A1A2E] shadow-[2px_2px_0px_#1A1A2E]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingFile}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FF5A36] hover:bg-[#E04522] text-white border-2 border-[#1A1A2E] rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
                >
                  <Save className={`w-3.5 h-3.5 ${creatingFile ? 'animate-spin' : ''}`} />
                  <span>{creatingFile ? 'Criando...' : 'Criar Arquivo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
