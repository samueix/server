import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  sizeFormatted: string;
  mtime: string;
  permissions?: string;
  extension?: string;
  typeCategory: 'folder' | 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'system' | 'other';
}

export interface FileExplorerResponse {
  currentPath: string;
  parentPath: string | null;
  items: FileItem[];
  totalFolders: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  canWrite: boolean;
}

export interface FileReadResponse {
  name: string;
  path: string;
  size: number;
  content: string;
  isBinary: boolean;
  truncated: boolean;
  mtime: string;
}

// Arquivos e padrões estritamente proibidos de leitura e manipulação
const BLOCKED_FILE_PATTERNS = [
  /\/etc\/shadow/i,
  /\/etc\/gshadow/i,
  /\/etc\/sudoers/i,
  /\/etc\/sudoers\.d/i,
  /\/?\.ssh\/id_/i,
  /\.key$/i,
  /\.pem$/i,
  /\.env(\.local|\.example)?$/i,
  /server-config\.json$/i
];

/**
 * Valida se um caminho é seguro contra path traversal e arquivos confidenciais
 */
export function assertPathSecurity(targetPath: string): string {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Caminho não fornecido.');
  }

  // Normaliza e resolve o caminho absoluto
  const normalized = path.normalize(targetPath);
  const resolved = path.resolve(normalized);

  // Rejeita tentativas de contornar via caracteres nulos
  if (resolved.includes('\0')) {
    throw new Error('Tentativa de manipulação de caminho inválida detectada.');
  }

  // Verifica padrões de arquivos confidenciais do sistema e da aplicação
  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(resolved)) {
      throw new Error('Acesso negado: o arquivo ou diretório solicitado é confidencial e protegido por política de segurança.');
    }
  }

  return resolved;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileCategory(name: string, isDir: boolean): FileItem['typeCategory'] {
  if (isDir) return 'folder';
  const ext = path.extname(name).toLowerCase();
  
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'];
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv'];
  const codeExts = ['.sh', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.html', '.css', '.yaml', '.yml', '.conf', '.service', '.xml', '.sql'];
  const archiveExts = ['.zip', '.tar', '.gz', '.bz2', '.xz', '.rar', '.7z', '.deb', '.iso'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (docExts.includes(ext)) return 'document';
  if (codeExts.includes(ext)) return 'code';
  if (archiveExts.includes(ext)) return 'archive';
  if (name.startsWith('.')) return 'system';
  return 'other';
}

export async function listDirectory(requestedPath?: string): Promise<FileExplorerResponse> {
  let targetPath = requestedPath ? assertPathSecurity(requestedPath) : '';
  
  if (!targetPath) {
    if (fs.existsSync('/home/samuel')) {
      targetPath = '/home/samuel';
    } else if (fs.existsSync('/home')) {
      targetPath = '/home';
    } else {
      targetPath = process.cwd();
    }
  }

  targetPath = assertPathSecurity(targetPath);

  // Garante que o caminho existe
  if (!fs.existsSync(targetPath)) {
    throw new Error(`O caminho especificado não existe: ${targetPath}`);
  }

  const stat = await fs.promises.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`O caminho informado não é uma pasta: ${targetPath}`);
  }

  const parentPath = targetPath === '/' ? null : path.dirname(targetPath);

  let dirEntries: fs.Dirent[] = [];
  try {
    dirEntries = await fs.promises.readdir(targetPath, { withFileTypes: true });
  } catch (err: any) {
    throw new Error(`Sem permissão para ler o diretório ${targetPath}: ${err.message}`);
  }

  let totalSizeBytes = 0;
  let totalFolders = 0;
  let totalFiles = 0;

  const items: FileItem[] = [];

  for (const entry of dirEntries) {
    const fullItemPath = path.join(targetPath, entry.name);

    // Oculta itens confidenciais da listagem
    if (BLOCKED_FILE_PATTERNS.some(p => p.test(fullItemPath))) {
      continue;
    }

    let isDir = false;
    let size = 0;
    let mtime = new Date().toISOString();
    let permissions = '';

    try {
      isDir = entry.isDirectory();
      const itemStat = await fs.promises.stat(fullItemPath);
      size = isDir ? 0 : itemStat.size;
      mtime = itemStat.mtime.toISOString();
      const modeOctal = (itemStat.mode & 0o777).toString(8);
      permissions = modeOctal;
    } catch {
      isDir = entry.isDirectory();
    }

    if (isDir) {
      totalFolders++;
    } else {
      totalFiles++;
      totalSizeBytes += size;
    }

    const extension = isDir ? undefined : path.extname(entry.name).toLowerCase();
    const typeCategory = getFileCategory(entry.name, isDir);

    items.push({
      name: entry.name,
      path: fullItemPath,
      isDirectory: isDir,
      size,
      sizeFormatted: isDir ? '--' : formatBytes(size),
      mtime,
      permissions,
      extension,
      typeCategory
    });
  }

  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });

  return {
    currentPath: targetPath,
    parentPath,
    items,
    totalFolders,
    totalFiles,
    totalSizeBytes,
    totalSizeFormatted: formatBytes(totalSizeBytes),
    canWrite: false
  };
}

export async function readTargetFile(filePath: string): Promise<FileReadResponse> {
  const resolvedPath = assertPathSecurity(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  const stat = await fs.promises.stat(resolvedPath);
  if (stat.isDirectory()) {
    throw new Error(`O caminho informado é um diretório, não um arquivo: ${resolvedPath}`);
  }

  const name = path.basename(resolvedPath);
  const size = stat.size;
  const maxReadBytes = 512 * 1024; // 512 KB
  let truncated = false;

  const fd = await fs.promises.open(resolvedPath, 'r');
  const buffer = Buffer.alloc(Math.min(size, maxReadBytes));
  const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
  await fd.close();

  if (size > maxReadBytes) {
    truncated = true;
  }

  let isBinary = false;
  for (let i = 0; i < Math.min(bytesRead, 1024); i++) {
    if (buffer[i] === 0) {
      isBinary = true;
      break;
    }
  }

  if (isBinary) {
    return {
      name,
      path: resolvedPath,
      size,
      content: `[Arquivo Binário - ${formatBytes(size)}]\nVisualização de conteúdo binário em texto desabilitada para evitar corrupção de exibição.`,
      isBinary: true,
      truncated: false,
      mtime: stat.mtime.toISOString()
    };
  }

  const content = buffer.toString('utf-8', 0, bytesRead);

  return {
    name,
    path: resolvedPath,
    size,
    content,
    isBinary: false,
    truncated,
    mtime: stat.mtime.toISOString()
  };
}

export async function createTargetFile(dirPath: string, fileName: string, initialContent: string = ''): Promise<{ success: boolean; filePath: string }> {
  const resolvedDir = assertPathSecurity(dirPath);

  const cleanName = fileName.trim();
  if (!cleanName || cleanName.includes('/') || cleanName.includes('\\') || cleanName.includes('..')) {
    throw new Error('Nome de arquivo inválido. Não use barras ou sequências de traversal.');
  }

  const targetFilePath = path.join(resolvedDir, cleanName);
  assertPathSecurity(targetFilePath);

  if (!fs.existsSync(resolvedDir)) {
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
    } catch {
      try {
        const escapedDir = resolvedDir.replace(/'/g, "'\\''");
        execSync(`sudo mkdir -p '${escapedDir}' && sudo chmod 777 '${escapedDir}'`);
      } catch {
        throw new Error(`O diretório informado não existe e não pôde ser criado: ${resolvedDir}`);
      }
    }
  }

  if (fs.existsSync(targetFilePath)) {
    throw new Error(`Já existe um arquivo ou pasta com o nome "${cleanName}".`);
  }

  try {
    await fs.promises.writeFile(targetFilePath, initialContent, 'utf-8');
    return { success: true, filePath: targetFilePath };
  } catch (writeErr: any) {
    if (writeErr.code === 'EACCES' || writeErr.code === 'EPERM') {
      try {
        await new Promise<void>((resolve, reject) => {
          const escapedPath = targetFilePath.replace(/'/g, "'\\''");
          exec(
            `printf "%s" "$INITIAL_CONTENT" | sudo tee '${escapedPath}' > /dev/null && sudo chmod 666 '${escapedPath}'`,
            {
              env: { ...process.env, INITIAL_CONTENT: initialContent }
            },
            (sudoErr) => {
              if (sudoErr) return reject(sudoErr);
              resolve();
            }
          );
        });
        return { success: true, filePath: targetFilePath };
      } catch {
        throw new Error(`Permissão negada para criar arquivo em "${resolvedDir}". Tente criar em uma pasta como /home/samuel.`);
      }
    }
    throw writeErr;
  }
}

export async function saveTargetFile(filePath: string, content: string): Promise<{ success: boolean; size: number }> {
  const resolvedPath = assertPathSecurity(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado para salvar: ${resolvedPath}`);
  }

  const stat = await fs.promises.stat(resolvedPath);
  if (stat.isDirectory()) {
    throw new Error('Não é possível salvar conteúdo de texto em um diretório.');
  }

  try {
    await fs.promises.writeFile(resolvedPath, content, 'utf-8');
    const newStat = await fs.promises.stat(resolvedPath);
    return { success: true, size: newStat.size };
  } catch (writeErr: any) {
    if (writeErr.code === 'EACCES' || writeErr.code === 'EPERM') {
      try {
        await new Promise<void>((resolve, reject) => {
          const escapedPath = resolvedPath.replace(/'/g, "'\\''");
          exec(
            `printf "%s" "$FILE_CONTENT" | sudo tee '${escapedPath}' > /dev/null`,
            {
              env: { ...process.env, FILE_CONTENT: content }
            },
            (sudoErr) => {
              if (sudoErr) return reject(sudoErr);
              resolve();
            }
          );
        });
        const newStat = await fs.promises.stat(resolvedPath);
        return { success: true, size: newStat.size };
      } catch {
        throw new Error(`Permissão negada ao salvar arquivo em "${resolvedPath}".`);
      }
    }
    throw writeErr;
  }
}
