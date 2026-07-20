/** Electron 渲染进程暴露的原生能力 */
interface ElectronApp {
  /** 是否运行在 Electron 中 */
  isElectron: boolean;
  /** Electron 版本号 */
  version: string;
  /** 操作系统平台 */
  platform: string;
  /** 应用版本 */
  appVersion: string;
  /** 打开原生文件对话框，支持多选 */
  openFileDialog?: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string[] | null>;
  /** 按路径读取文件（返回 name / data(base64) / mime） */
  readFilesByPaths?: (filePaths: string[]) => Promise<Array<{ name: string; data: string; mime: string }>>;
  /** 监听菜单触发的"批量导入"事件，返回清理函数 */
  onMenuBatchImport?: (callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronApp?: ElectronApp;
  }
}

export {};
