/**
 * preload 脚本：在隔离的上下文中向渲染进程暴露受控的原生能力
 * 渲染进程通过 window.electronApp 访问
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApp", {
  /** 是否运行在 Electron 中 */
  isElectron: true,
  /** Electron 版本号 */
  version: process.versions.electron,
  /** 操作系统平台 */
  platform: process.platform,
  /** 应用版本 */
  appVersion: process.env.npm_package_version || "0.0.0",

  /**
   * 打开原生文件对话框（批量选择文件）
   * @param options 可选，设置文件过滤器
   * @returns 选中文件的路径数组，或取消时返回 null
   */
  openFileDialog: (options) => {
    return ipcRenderer.invoke("open-file-dialog", options);
  },

  /**
   * 按路径读取文件（返回 { name, data: base64, mime } 数组）
   * @param filePaths 文件绝对路径数组
   * @returns 文件数据数组
   */
  readFilesByPaths: (filePaths) => {
    return ipcRenderer.invoke("read-files-by-paths", filePaths);
  },

  /**
   * 监听菜单触发的"批量导入"事件
   * @param callback 收到事件时触发
   */
  onMenuBatchImport: (callback) => {
    ipcRenderer.on("menu-batch-import", callback);
    // 返回清理函数
    return () => ipcRenderer.removeListener("menu-batch-import", callback);
  },
});
