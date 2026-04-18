/**
 * Install Service - 管理分支下载、缓存和安装到设备
 * 
 * 工作流：
 * 1. Git 克隆分支到 App 沙盒（最多缓存 2 个分支）
 * 2. 删除设备 /data/openpilot
 * 3. 推送分支到设备 /data/openpilot
 * 4. Sudo 重启设备
 */

import { sshService } from './ssh-service';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CachedBranch {
  name: string;
  repoUrl: string;
  localPath: string;
  timestamp: number;
  size: number;
}

class InstallService {
  private cacheDir = FileSystem.documentDirectory + 'branch_cache/';
  private maxCachedBranches = 2;

  async ensureCacheDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
    }
  }

  /**
   * 获取已缓存的分支列表
   */
  async getCachedBranches(): Promise<CachedBranch[]> {
    try {
      const json = await AsyncStorage.getItem('cached_branches');
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存缓存的分支列表
   */
  private async saveCachedBranches(branches: CachedBranch[]): Promise<void> {
    await AsyncStorage.setItem('cached_branches', JSON.stringify(branches));
  }

  /**
   * 清理超过限制的缓存分支（保留最新的 2 个）
   */
  private async cleanupOldCaches(keepBranch?: string): Promise<void> {
    const cached = await this.getCachedBranches();
    
    // 按时间戳排序，保留最新的
    const sorted = cached
      .filter(b => keepBranch ? b.name !== keepBranch : true)
      .sort((a, b) => b.timestamp - a.timestamp);

    // 如果超过限制，删除最旧的
    const toDelete = sorted.slice(this.maxCachedBranches - 1);
    
    for (const branch of toDelete) {
      try {
        await FileSystem.deleteAsync(branch.localPath, { idempotent: true });
      } catch (e) {
        console.warn(`Failed to delete cache: ${branch.localPath}`, e);
      }
    }

    // 更新缓存列表
    const remaining = cached.filter(b => !toDelete.find(d => d.name === b.name));
    await this.saveCachedBranches(remaining);
  }

  /**
   * 下载分支到本地缓存
   * 
   * @param repoUrl Git 仓库 URL
   * @param branchName 分支名称
   * @param onProgress 进度回调 (0-100)
   */
  async downloadBranch(
    repoUrl: string,
    branchName: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    await this.ensureCacheDir();

    const cached = await this.getCachedBranches();
    const existing = cached.find(b => b.name === branchName && b.repoUrl === repoUrl);
    
    if (existing) {
      // 检查缓存是否仍然存在
      const info = await FileSystem.getInfoAsync(existing.localPath);
      if (info.exists) {
        onProgress?.(100);
        return existing.localPath;
      }
    }

    // 清理旧缓存，为新分支腾出空间
    await this.cleanupOldCaches(branchName);

    const branchDir = this.cacheDir + branchName + '_' + Date.now();
    
    // 在设备上执行 git clone，然后通过 SFTP 下载到本地
    // 这里我们使用一个临时目录在设备上克隆
    const tempRemotePath = `/tmp/cc_branch_${Date.now()}`;

    try {
      onProgress?.(5);

      // Step 1: 在设备上克隆分支
      const cloneCmd = `git clone --depth 1 --single-branch --branch "${branchName}" "${repoUrl}" "${tempRemotePath}" 2>&1`;
      const cloneResult = await sshService.exec(cloneCmd);
      
      if (cloneResult.includes('fatal') || cloneResult.includes('error')) {
        throw new Error(`Git clone failed: ${cloneResult}`);
      }

      onProgress?.(50);

      // Step 2: 压缩为 tar.gz
      const tarPath = `/tmp/cc_branch_${Date.now()}.tar.gz`;
      const tarCmd = `cd /tmp && tar -czf ${tarPath} $(basename ${tempRemotePath}) 2>&1`;
      const tarResult = await sshService.exec(tarCmd);
      
      if (tarResult.includes('error')) {
        throw new Error(`Tar failed: ${tarResult}`);
      }

      onProgress?.(70);

      // Step 3: 通过 SFTP 下载到本地
      const localTarPath = branchDir + '.tar.gz';
      await sshService.downloadFile(tarPath, this.cacheDir);
      
      // 重命名下载的文件
      const downloadedPath = this.cacheDir + tarPath.split('/').pop();
      if (downloadedPath !== localTarPath) {
        await FileSystem.moveAsync({
          from: downloadedPath,
          to: localTarPath,
        });
      }

      onProgress?.(85);

      // Step 4: 解压到缓存目录
      // 注意：React Native 没有内置的 tar 解压，所以我们保存 tar.gz 文件
      // 实际安装时会在设备上解压

      onProgress?.(100);

      // 记录缓存
      const newBranch: CachedBranch = {
        name: branchName,
        repoUrl,
        localPath: localTarPath,
        timestamp: Date.now(),
        size: 0, // 可以通过 FileSystem.getInfoAsync 获取
      };

      const updated = [...cached.filter(b => b.name !== branchName), newBranch];
      await this.saveCachedBranches(updated);

      // 清理设备上的临时文件
      try {
        await sshService.exec(`rm -rf ${tempRemotePath} ${tarPath}`);
      } catch (e) {
        console.warn('Failed to cleanup remote temp files', e);
      }

      return localTarPath;
    } catch (err: any) {
      // 清理失败的下载
      try {
        await FileSystem.deleteAsync(branchDir, { idempotent: true });
      } catch (e) {
        console.warn('Failed to cleanup failed download', e);
      }
      throw err;
    }
  }

  /**
   * 安装分支到设备
   * 
   * @param branchTarPath 本地缓存的 tar.gz 路径
   * @param branchName 分支名称（用于显示）
   * @param onProgress 进度回调 (0-100)
   */
  async installBranch(
    branchTarPath: string,
    branchName: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!sshService.isConnected) {
      throw new Error('Device not connected');
    }

    try {
      onProgress?.(5);

      // Step 1: 上传 tar.gz 到设备
      const remoteDir = '/tmp';
      const remoteFileName = `cc_install_${Date.now()}.tar.gz`;
      const remoteTarPath = `${remoteDir}/${remoteFileName}`;

      await sshService.uploadFile(branchTarPath, remoteTarPath);
      onProgress?.(30);

      // Step 2: 删除旧的 /data/openpilot
      const deleteCmd = `rm -rf /data/openpilot && echo DELETE_OK`;
      const deleteResult = await sshService.exec(deleteCmd);
      
      if (!deleteResult.includes('DELETE_OK')) {
        throw new Error('Failed to delete /data/openpilot');
      }

      onProgress?.(50);

      // Step 3: 解压到 /data/openpilot
      const extractCmd = `cd /data && tar -xzf ${remoteTarPath} && mv openpilot_* openpilot 2>/dev/null || true && echo EXTRACT_OK`;
      const extractResult = await sshService.exec(extractCmd);
      
      if (!extractResult.includes('EXTRACT_OK')) {
        throw new Error('Failed to extract branch');
      }

      onProgress?.(80);

      // Step 4: 清理临时文件
      await sshService.exec(`rm -f ${remoteTarPath}`);

      onProgress?.(95);

      // Step 5: 使用 sudo 重启设备
      // 注意：这会断开 SSH 连接
      const rebootCmd = `sudo reboot`;
      try {
        await sshService.exec(rebootCmd);
      } catch (e) {
        // 重启会导致连接断开，这是预期的
        console.log('Device rebooting (connection will be lost)');
      }

      onProgress?.(100);
    } catch (err: any) {
      throw new Error(`Installation failed: ${err.message}`);
    }
  }

  /**
   * 清空所有缓存
   */
  async clearCache(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.cacheDir, { idempotent: true });
      await AsyncStorage.removeItem('cached_branches');
    } catch (e) {
      console.warn('Failed to clear cache', e);
    }
  }
}

export const installService = new InstallService();
