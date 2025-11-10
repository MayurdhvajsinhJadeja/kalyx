const DANGEROUS = [
  /\brm\s+-rf\b/i,
  /\bmkfs(\.|_)?/i,
  /\bdd\s+if=.*\s+of=\/dev\/(sd|nvme|disk)/i,
  /\bparted\b.*\bmklabel\b/i,
  /\biptables\s+-F\b/i,
  /\bshutdown\s+-h\b/i,
  /\breboot\b/i,
  /\bchown\s+-R\s+\/\b/i,
  /:\(\)\s*{\s*:\|\s*:\s*&\s*};\s*:/, // fork bomb
  /\b>!?\s*\/\w+/i, // clobber root files
];

export function looksDangerous(cmd) {
  return DANGEROUS.some(rx => rx.test(cmd));
}
