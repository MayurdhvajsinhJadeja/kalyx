// Detect redirections and tee/Tee-Object; strip or compose as needed.

// POSIX:  >, >>, 1>, 2>, | tee ...
const POSIX_RX = /\s(?:\d?>{1,2})\s+(["'][^"']+["']|[^\s&|;]+)|\|\s*tee\b[^\n]*/gi;
// PowerShell: >, >>, Out-File, | Tee-Object ...
const PS_RX    = /\s>>?\s+(["'][^"']+["']|[^\s&|;]+)|\|\s*Tee-Object\b[^\n]*|\|\s*Out-File\b[^\n]*/gi;

export function containsRedirection(cmd, isWindows = false) {
  return (isWindows ? PS_RX : POSIX_RX).test(cmd);
}

export function stripRedirections(cmd, isWindows = false) {
  const rx = isWindows ? PS_RX : POSIX_RX;
  return cmd.replace(rx, '').trim();
}

export function composeSaveWithTee(baseCmd, file, { append = false, includeStderr = false, isWindows = false } = {}) {
  let cmd = baseCmd.trim();
  if (!isWindows && includeStderr) cmd += ' 2>&1';

  if (isWindows) {
    // PowerShell: Tee-Object
    const flag = append ? ' -Append' : '';
    return `${cmd} | Tee-Object -FilePath "${file}"${flag}`;
  } else {
    // POSIX: tee
    const flag = append ? '-a ' : '';
    return `${cmd} | tee ${flag}${file}`;
  }
}
