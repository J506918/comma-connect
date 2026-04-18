/**
 * Web mock for @dylankenneally/react-native-ssh-sftp
 * This native module only works on Android/iOS.
 * On web, all methods throw a "not supported" error.
 * Uses CommonJS exports for Metro bundler compatibility.
 */

const NOT_SUPPORTED = () => Promise.reject(new Error("SSH is not supported on web platform"));

const PtyType = {
  VANILLA: "vanilla",
  VT100: "vt100",
  VT102: "vt102",
  VT220: "vt220",
  ANSI: "ansi",
  XTERM: "xterm",
};

class SSHClientMock {
  static connectWithKey() { return NOT_SUPPORTED(); }
  static connectWithPassword() { return NOT_SUPPORTED(); }
  execute() { return NOT_SUPPORTED(); }
  startShell() { return NOT_SUPPORTED(); }
  writeToShell() { return NOT_SUPPORTED(); }
  closeShell() { return NOT_SUPPORTED(); }
  connectSFTP() { return NOT_SUPPORTED(); }
  sftpLs() { return NOT_SUPPORTED(); }
  sftpRename() { return NOT_SUPPORTED(); }
  sftpMkdir() { return NOT_SUPPORTED(); }
  sftpRm() { return NOT_SUPPORTED(); }
  sftpRmdir() { return NOT_SUPPORTED(); }
  sftpUpload() { return NOT_SUPPORTED(); }
  sftpDownload() { return NOT_SUPPORTED(); }
  disconnectSFTP() { return NOT_SUPPORTED(); }
  disconnect() {}
  on() { return this; }
  off() { return this; }
}

// CommonJS exports for Metro bundler compatibility
module.exports = SSHClientMock;
module.exports.default = SSHClientMock;
module.exports.PtyType = PtyType;
