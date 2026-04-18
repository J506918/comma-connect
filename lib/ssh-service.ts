/**
 * SSH Service — singleton connection manager
 * Uses @dylankenneally/react-native-ssh-sftp (native Android/iOS SSH implementation)
 *
 * SECURITY NOTE: This service ONLY operates on the remote comma device.
 * It has NO access to the phone's local filesystem except the App sandbox.
 * All remote file operations go through SFTP to the remote device.
 */

export interface SSHConnectOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SFTPEntry {
  filename: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  permissions: number;
}

export interface CanMessage {
  id: string;
  data: string;
  channel: string;
  timestamp: number;
  dlc?: number;
}

type SSHEventType = 'connected' | 'disconnected' | 'error';
type SSHListener = (...args: any[]) => void;

class SSHService {
  private client: any = null;
  private connected = false;
  private connecting = false;
  private sftpConnected = false;
  private shellOpen = false;
  private listeners: Map<SSHEventType, SSHListener[]> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  get isConnected() {
    return this.connected;
  }

  get isConnecting() {
    return this.connecting;
  }

  // ─── Simple Event Emitter (no Node.js dependency) ─────────────────────────

  on(event: SSHEventType, listener: SSHListener): this {
    const arr = this.listeners.get(event) || [];
    arr.push(listener);
    this.listeners.set(event, arr);
    return this;
  }

  off(event: SSHEventType, listener: SSHListener): this {
    const arr = this.listeners.get(event) || [];
    this.listeners.set(event, arr.filter(l => l !== listener));
    return this;
  }

  once(event: SSHEventType, listener: SSHListener): this {
    const wrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  private emit(event: SSHEventType, ...args: any[]): void {
    const arr = this.listeners.get(event) || [];
    arr.forEach(l => {
      try { l(...args); } catch (_) {}
    });
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    let consecutiveFailures = 0;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.connected || !this.client) {
        this.stopHeartbeat();
        return;
      }
      try {
        await this.exec('echo 1');
        consecutiveFailures = 0;
      } catch (_) {
        consecutiveFailures++;
        if (consecutiveFailures >= 2) {
          // Connection lost
          this.stopHeartbeat();
          this.connected = false;
          this.connecting = false;
          this.sftpConnected = false;
          this.shellOpen = false;
          this.client = null;
          this.emit('disconnected');
        }
      }
    }, 8000); // Check every 8 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  async connect(options: SSHConnectOptions): Promise<void> {
    if (this.connected || this.connecting) {
      await this.disconnect();
    }

    this.connecting = true;

    try {
      const mod = require('@dylankenneally/react-native-ssh-sftp');
      const SSHClient = mod?.default ?? mod;

      if (options.privateKey) {
        this.client = await SSHClient.connectWithKey(
          options.host,
          options.port,
          options.username,
          options.privateKey,
          options.passphrase || ''
        );
      } else {
        this.client = await SSHClient.connectWithPassword(
          options.host,
          options.port,
          options.username,
          options.password || ''
        );
      }

      this.connected = true;
      this.connecting = false;
      this.startHeartbeat();
      this.emit('connected');
    } catch (err: any) {
      this.connected = false;
      this.connecting = false;
      this.client = null;
      this.emit('error', err.message || '连接失败');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.client) {
      try {
        if (this.shellOpen) {
          await this.client.closeShell();
          this.shellOpen = false;
        }
        if (this.sftpConnected) {
          await this.client.disconnectSFTP();
          this.sftpConnected = false;
        }
        this.client.disconnect();
      } catch (_) {}
      this.client = null;
    }
    this.connected = false;
    this.connecting = false;
    this.sftpConnected = false;
    this.shellOpen = false;
    this.emit('disconnected');
  }

  // ─── Shell / Terminal ──────────────────────────────────────────────────────

  async openShell(
    onData: (data: string) => void,
    onClose?: () => void
  ): Promise<(data: string) => void> {
    if (!this.connected || !this.client) {
      throw new Error('未连接设备');
    }

    // If shell already open, just re-register listener
    if (this.shellOpen) {
      this.client.removeAllListeners('Shell');
      this.client.on('Shell', (event: string | null) => {
        if (event) onData(event);
      });
      return (input: string) => this.writeToShell(input);
    }

    // Start shell with fallback shell types
    try {
      await this.client.startShell('xterm');
    } catch (err) {
      console.warn('xterm shell failed, trying bash:', err);
      try {
        await this.client.startShell('bash');
      } catch (err2) {
        console.warn('bash shell failed, trying sh:', err2);
        await this.client.startShell('sh');
      }
    }
    this.shellOpen = true;

    const shellListener = (event: string | null) => {
      if (event) onData(event);
    };
    this.client.on('Shell', shellListener);

    // Watch for disconnect to notify shell close
    const disconnectHandler = () => {
      this.shellOpen = false;
      if (this.client) this.client.removeListener('Shell', shellListener);
      onClose?.();
    };
    this.once('disconnected', disconnectHandler);

    return (input: string) => this.writeToShell(input);
  }

  async writeToShell(input: string): Promise<void> {
    if (!this.client || !this.shellOpen) return;
    try {
      await this.client.writeToShell(input);
    } catch (err) {
      console.warn('Shell write error:', err);
    }
  }

  async closeShell(): Promise<void> {
    if (!this.client || !this.shellOpen) return;
    try {
      await this.client.closeShell();
    } catch (_) {}
    this.shellOpen = false;
  }

  // ─── Execute Command ───────────────────────────────────────────────────────

  async exec(command: string): Promise<string> {
    if (!this.connected || !this.client) {
      throw new Error('未连接设备');
    }
    try {
      const result = await this.client.execute(command);
      return result || '';
    } catch (err: any) {
      throw new Error(err.message || 'Command execution failed');
    }
  }

  // ─── SFTP ──────────────────────────────────────────────────────────────────

  private async ensureSFTP(): Promise<void> {
    if (this.sftpConnected) return;
    if (!this.connected || !this.client) throw new Error('Not connected');
    await this.client.connectSFTP();
    this.sftpConnected = true;
  }

  async listDir(path: string): Promise<SFTPEntry[]> {
    await this.ensureSFTP();
    const items: any[] = await this.client.sftpLs(path);

    return (items || []).map((item: any) => ({
      filename: item.filename || item.name || '',
      isDirectory: item.isDirectory ?? false,
      size: item.fileSize ?? item.size ?? 0,
      mtime: item.modificationDate ?? item.mtime ?? 0,
      permissions: item.permissions ?? 0,
    })).sort((a: SFTPEntry, b: SFTPEntry) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.filename.localeCompare(b.filename);
    });
  }

  async readFile(remotePath: string): Promise<string> {
    return this.exec(`cat "${remotePath}"`);
  }

  async writeFile(remotePath: string, content: string): Promise<void> {
    const escaped = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/\n/g, '\\n');
    await this.exec(`printf '%b' '${escaped}' > "${remotePath}"`);
  }

  async downloadFile(remotePath: string, localDir: string): Promise<string> {
    await this.ensureSFTP();
    const dir = localDir.endsWith('/') ? localDir : localDir + '/';
    const downloaded = await this.client.sftpDownload(remotePath, dir);
    return downloaded;
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.ensureSFTP();
    const remoteDir = remotePath.endsWith('/') ? remotePath : remotePath.substring(0, remotePath.lastIndexOf('/') + 1);
    await this.client.sftpUpload(localPath, remoteDir);
  }

  async deleteFile(remotePath: string): Promise<void> {
    await this.ensureSFTP();
    await this.client.sftpRm(remotePath);
  }

  async deleteDir(remotePath: string): Promise<void> {
    await this.ensureSFTP();
    await this.client.sftpRmdir(remotePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.ensureSFTP();
    await this.client.sftpRename(oldPath, newPath);
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.ensureSFTP();
    await this.client.sftpMkdir(remotePath);
  }

  // ─── Device Info ───────────────────────────────────────────────────────────

  async getDeviceInfo(): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    try {
      const combined = [
        `echo "___T___" && cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "0"`,
        `echo "___F___" && (cat /sys/class/hwmon/hwmon0/fan1_input 2>/dev/null || cat /sys/class/hwmon/hwmon1/fan1_input 2>/dev/null || cat /sys/devices/platform/soc/*/hwmon/hwmon*/fan1_input 2>/dev/null || echo "0")`,
        `echo "___U___" && uptime -p 2>/dev/null || uptime`,
        `echo "___M___" && cat /proc/meminfo`,
        `echo "___D___" && df -k /data 2>/dev/null | tail -1 || df -k / | tail -1`,
        `echo "___C___" && top -bn1 2>/dev/null | grep -i "cpu" | head -1 || echo "0"`,
        `echo "___G___" && (cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage 2>/dev/null || cat /sys/class/devfreq/*/gpu_busy_percentage 2>/dev/null || cat /sys/kernel/gpu/gpu_busy 2>/dev/null || echo "N/A")`,
        `echo "___V___" && cat /VERSION 2>/dev/null || echo "unknown"`,
        `echo "___B___" && (getprop ro.build.version.release 2>/dev/null || uname -r)`,
        `echo "___H___" && hostname`,
        `echo "___A___" && uname -m`,
      ].join('; ');

      const output = await this.exec(combined);

      const extract = (marker: string, nextMarker: string) => {
        const start = output.indexOf(`___${marker}___`);
        const end = nextMarker ? output.indexOf(`___${nextMarker}___`) : output.length;
        if (start === -1) return '';
        return output.substring(start + marker.length + 6, end === -1 ? undefined : end).trim();
      };

      const markers = ['T', 'F', 'U', 'M', 'D', 'C', 'G', 'V', 'B', 'H', 'A'];
      const keys = ['temperature', 'fanRpm', 'uptime', 'memInfo', 'diskInfo', 'cpuUsage', 'gpuUsage', 'systemVersion', 'buildNumber', 'hostname', 'architecture'];
      markers.forEach((m, i) => {
        results[keys[i]] = extract(m, markers[i + 1] || '');
      });

      // Normalize temperature (some devices report in millidegrees)
      if (results.temperature) {
        const temp = parseFloat(results.temperature);
        if (!isNaN(temp) && temp > 1000) {
          results.temperature = (temp / 1000).toFixed(1);
        }
      }

      // Normalize fan RPM
      if (results.fanRpm) {
        const rpm = parseInt(results.fanRpm, 10);
        if (!isNaN(rpm)) {
          results.fanRpm = String(rpm);
        }
      }

      // Normalize GPU usage
      if (results.gpuUsage && results.gpuUsage !== 'N/A') {
        const gpuMatch = results.gpuUsage.match(/(\d+)/);
        if (gpuMatch) {
          results.gpuUsage = gpuMatch[1] + '%';
        }
      }
    } catch (err) {
      console.warn('getDeviceInfo error:', err);
    }
    return results;
  }

  // ─── Log Streaming ─────────────────────────────────────────────────────────

  async streamLogs(
    onLine: (line: string) => void,
    onError?: (err: string) => void
  ): Promise<() => void> {
    if (!this.connected || !this.client) {
      throw new Error('未连接设备');
    }

    let running = true;
    const seenLines = new Set<string>();

    const poll = async () => {
      let isFirstRun = true;
      while (running && this.connected) {
        try {
          // Priority: openpilot logs > logcat > journalctl > syslog
          const cmd = isFirstRun
            ? `(tail -n 100 /data/log/swaglog.kjson 2>/dev/null || tail -n 100 /tmp/log/swaglog.kjson 2>/dev/null || logcat -d -t 100 2>/dev/null || journalctl -n 100 --no-pager -o short 2>/dev/null || tail -n 50 /var/log/syslog 2>/dev/null) | tail -n 50`
            : `(tail -n 50 /data/log/swaglog.kjson 2>/dev/null || tail -n 50 /tmp/log/swaglog.kjson 2>/dev/null || logcat -d -t 50 2>/dev/null || journalctl -n 50 --no-pager -o short 2>/dev/null || tail -n 30 /var/log/syslog 2>/dev/null) | tail -n 30`;

          const output = await this.exec(cmd);
          if (output) {
            const lines = output.split('\n').filter(Boolean);
            lines.forEach(line => {
              const lineHash = line.substring(0, 80);
              if (!seenLines.has(lineHash)) {
                seenLines.add(lineHash);
                onLine(line);
              }
            });
            if (seenLines.size > 500) {
              const arr = Array.from(seenLines);
              arr.slice(0, -200).forEach(h => seenLines.delete(h));
            }
          }
          isFirstRun = false;
        } catch (err: any) {
          if (running) onError?.(err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };

    poll();
    return () => { running = false; };
  }

  // ─── CAN Data Capture (using openpilot dump.py) ────────────────────────────

  async startCanCapture(
    onMessage: (msg: CanMessage) => void,
    onError?: (err: string) => void
  ): Promise<() => void> {
    if (!this.connected || !this.client) {
      throw new Error('未连接设备');
    }

    let running = true;
    let messageCount = 0;

    const poll = async () => {
      while (running && this.connected) {
        try {
          // Try multiple CAN capture methods
          let output = '';
          try {
            // Method 1: openpilot dump.py
            output = await this.exec(
              `timeout 1 python3 /data/openpilot/selfdrive/debug/dump.py can 2>/dev/null | head -30`
            );
          } catch (e) {
            // Method 2: candump
            try {
              output = await this.exec(`timeout 0.5 candump -n 20 any 2>/dev/null`);
            } catch (e2) {
              // Method 3: ip link show and try socketcan
              try {
                output = await this.exec(
                  `ip link show | grep can || echo "NO_CAN"`
                );
              } catch (e3) {
                output = '';
              }
            }
          }

          // If no output from any method, no real CAN data available
          if (!output || output.trim() === '' || output.trim() === 'NO_CAN') {
            // No real data - show 0
            onMessage({
              channel: 'can0',
              id: '0',
              data: '00',
              dlc: 1,
              timestamp: Date.now(),
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          if (output && output.trim() !== 'NO_CAN_TOOL' && output.trim() !== 'NO_CAN') {
            const lines = output.split('\n').filter(Boolean);
            lines.forEach((line, idx) => {
              // dump.py output format: various, try to parse
              // candump format: interface ID#DATA
              const candumpMatch = line.match(/^\s*(\S+)\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/);
              // Generic hex format: channel 0xID data
              const hexMatch = line.match(/^(\S+)\s+(0x[0-9A-Fa-f]+)\s+([0-9A-Fa-f]*)/);
              // dump.py cereal format: parse address and data from cereal output
              const cerealMatch = line.match(/address:\s*(\d+).*dat:\s*["']([0-9A-Fa-f]+)/i);
              // Simple numeric format: ID DATA
              const simpleMatch = line.match(/^\s*(\d+)\s+([0-9A-Fa-f]+)\s*$/);

              if (candumpMatch) {
                onMessage({
                  channel: candumpMatch[1],
                  id: candumpMatch[2].toUpperCase(),
                  data: candumpMatch[3].toUpperCase(),
                  dlc: Math.floor(candumpMatch[3].length / 2),
                  timestamp: Date.now() + idx,
                });
              } else if (hexMatch) {
                onMessage({
                  channel: hexMatch[1],
                  id: hexMatch[2].replace('0x', '').toUpperCase(),
                  data: hexMatch[3].toUpperCase(),
                  dlc: Math.floor(hexMatch[3].length / 2),
                  timestamp: Date.now() + idx,
                });
              } else if (cerealMatch) {
                const decId = parseInt(cerealMatch[1], 10);
                onMessage({
                  channel: 'can0',
                  id: decId.toString(16).toUpperCase(),
                  data: cerealMatch[2].toUpperCase(),
                  dlc: Math.floor(cerealMatch[2].length / 2),
                  timestamp: Date.now() + idx,
                });
              } else if (simpleMatch) {
                const decId = parseInt(simpleMatch[1], 10);
                onMessage({
                  channel: 'can0',
                  id: decId.toString(16).toUpperCase(),
                  data: simpleMatch[2].toUpperCase(),
                  dlc: Math.floor(simpleMatch[2].length / 2),
                  timestamp: Date.now() + idx,
                });
              } else if (line.trim().length > 5) {
                // Raw line fallback — show as-is
                onMessage({
                  channel: 'raw',
                  id: '---',
                  data: line.trim().substring(0, 40),
                  dlc: 0,
                  timestamp: Date.now() + idx,
                });
              }
            });
          } else if (output && output.trim() === 'NO_CAN_TOOL') {
            if (running) onError?.('No CAN capture tool found on device. Requires openpilot dump.py or candump.');
            running = false;
          }
        } catch (err: any) {
          if (running) onError?.(err.message);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };

    poll();
    return () => { running = false; };
  }
}

export const sshService = new SSHService();
