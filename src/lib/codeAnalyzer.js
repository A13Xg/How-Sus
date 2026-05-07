/**
 * codeAnalyzer.js — Static analysis of code snippets for suspicious/malicious patterns.
 * Supports Bash/sh, Python, and PowerShell.
 *
 * All analysis is purely static (regex/pattern-based) — no code is executed.
 * Returns a structured findings object for display in the UI.
 */

// ─── Language detection ───────────────────────────────────────────────────────

const BASH_SIGNALS = [
  /^#!.*\/(?:bash|sh|zsh|dash)/m,
  /\$\(.*\)/,
  /\|\s*(?:bash|sh|zsh)/,
  /\bchmod\b/,
  /\bsudo\b/,
  /\becho\b.*>>/,
  /\bexport\b\s+[A-Z_]+=/, 
  /\bcurl\b.*-[oO]/,
  /\bwget\b/,
];

const PYTHON_SIGNALS = [
  /^#!.*python/m,
  /\bimport\s+\w+/,
  /\bfrom\s+\w+\s+import\b/,
  /\bdef\s+\w+\s*\(/,
  /\bprint\s*\(/,
  /\bif\s+__name__\s*==\s*['"]__main__['"]/,
  /\bos\.system\b/,
  /\bsubprocess\b/,
];

const POWERSHELL_SIGNALS = [
  /\$\w+\s*=/,
  /\bInvoke-(?:Expression|WebRequest|RestMethod)\b/i,
  /\bGet-(?:Process|Service|Item|Content)\b/i,
  /\bSet-(?:ExecutionPolicy|Item)\b/i,
  /\bNew-(?:Object|Item|Service)\b/i,
  /\bWrite-(?:Host|Output|Error)\b/i,
  /\.ps1\b/i,
  /-ExecutionPolicy\b/i,
  /\bPowerShell\b/i,
];

/**
 * Detect the language of a code snippet.
 * @param {string} code
 * @returns {'bash'|'python'|'powershell'|'unknown'}
 */
export function detectLanguage(code) {
  if (!code || typeof code !== 'string') return 'unknown';
  const bashScore   = BASH_SIGNALS.filter((r) => r.test(code)).length;
  const pyScore     = PYTHON_SIGNALS.filter((r) => r.test(code)).length;
  const psScore     = POWERSHELL_SIGNALS.filter((r) => r.test(code)).length;

  const max = Math.max(bashScore, pyScore, psScore);
  if (max === 0) return 'unknown';
  if (bashScore === max) return 'bash';
  if (pyScore   === max) return 'python';
  return 'powershell';
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_SCORE = { low: 5, medium: 15, high: 25, critical: 40 };

function finding(label, match, explanation, why, severity) {
  return { label, match, explanation, why, severity, score: SEVERITY_SCORE[severity] ?? 10 };
}

/**
 * Build a line-offset map from a code string so we can resolve character
 * indices → line numbers in O(1) after a single O(n) pass.
 * @param {string} code
 * @returns {(index: number) => number} lineOf — 1-based line number for char index
 */
function buildLineMap(code) {
  const offsets = [0]; // offsets[i] = char index of first char of line i+1
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') offsets.push(i + 1);
  }
  return function lineOf(index) {
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ─── Bash / sh analysis ───────────────────────────────────────────────────────

/**
 * @param {string} code
 * @returns {Array<object>} findings
 */
function analyzeBash(code) {
  const findings = [];
  const lines = code.split('\n');
  const lineOf = buildLineMap(code);

  const checks = [
    {
      re: /\bsudo\b|\bsu\b\s+-/g,
      label: 'Elevated privilege execution',
      explanation: 'Runs commands as root or superuser.',
      why: 'Privilege escalation can allow unrestricted system access.',
      severity: 'high',
    },
    {
      re: /\bchmod\s+(?:777|\+s|a\+[rwx]+)/g,
      label: 'Permissive file permissions',
      explanation: 'Sets world-writable or setuid/setgid permissions.',
      why: 'chmod 777 or +s can create exploitable binaries or shared files.',
      severity: 'high',
    },
    {
      re: /curl\s+[^|]+\|\s*(?:ba)?sh|wget\s+-[qO-]+\s+[^|]+\|\s*(?:ba)?sh/g,
      label: 'Remote code execution (pipe to shell)',
      explanation: 'Downloads and immediately executes remote code.',
      why: 'Pipe-to-shell is a classic RCE pattern; the remote content is unverified.',
      severity: 'critical',
    },
    {
      re: /\brm\s+-[rf]+\s+[/~*]/g,
      label: 'Destructive file deletion',
      explanation: 'Recursively removes files from root or home directory.',
      why: 'Can permanently destroy the file system if run.',
      severity: 'critical',
    },
    {
      re: /\/etc\/(?:passwd|shadow|sudoers|crontab)/g,
      label: 'Sensitive system file access',
      explanation: 'Reads or modifies critical Unix authentication/config files.',
      why: 'These files contain password hashes and privilege configurations.',
      severity: 'high',
    },
    {
      re: /base64\s+-d|xxd\s+-r/g,
      label: 'Binary/base64 decoding',
      explanation: 'Decodes base64 or hex-encoded data.',
      why: 'Often used to obfuscate payloads; decoded content is hidden from casual inspection.',
      severity: 'medium',
    },
    {
      re: /\bnc\s+[-\w]*\s+-l|\bncat\b|\bnetcat\b/g,
      label: 'Network listener / reverse shell',
      explanation: 'Opens a network listening socket.',
      why: 'Netcat listeners are a primary tool for reverse shells and backdoors.',
      severity: 'critical',
    },
    {
      re: /\bcrontab\b\s+-[li]|\bsystemctl\s+enable\b/g,
      label: 'Persistence mechanism',
      explanation: 'Installs a cron job or enables a system service.',
      why: 'Ensures malicious code survives reboots.',
      severity: 'high',
    },
    {
      re: /\beval\s*\$\(|eval\s*`[^`]+`/g,
      label: 'Dynamic code injection (eval)',
      explanation: 'Executes dynamically constructed shell commands.',
      why: 'eval allows arbitrary code execution from variable content.',
      severity: 'critical',
    },
    {
      re: /iptables\s+-F|\bufw\s+disable\b|\bsystemctl\s+stop\s+firewall/g,
      label: 'Firewall manipulation',
      explanation: 'Flushes or disables firewall rules.',
      why: 'Removes network protection, enabling inbound/outbound attacks.',
      severity: 'high',
    },
    {
      re: /\bdd\s+if=\/dev\/zero|\bmkfs\.\w+/g,
      label: 'Disk destruction',
      explanation: 'Overwrites disk data or reformats a file system.',
      why: 'Can permanently destroy data on the target drive.',
      severity: 'critical',
    },
    {
      re: /\bexport\s+PATH\s*=/g,
      label: 'PATH hijacking',
      explanation: 'Overrides the system PATH variable.',
      why: 'Malicious binaries can be executed in place of trusted system commands.',
      severity: 'high',
    },
    {
      re: />\s*\/dev\/null\s+2>&1|2>&1\s*>\s*\/dev\/null/g,
      label: 'Output suppression',
      explanation: 'Redirects both stdout and stderr to /dev/null.',
      why: 'Hides all command output, making activity invisible in logs/terminals.',
      severity: 'low',
    },
  ];

  for (const check of checks) {
    const matches = [];
    let m;
    const re = new RegExp(check.re.source, check.re.flags);
    while ((m = re.exec(code)) !== null) {
      const lineNo = lineOf(m.index);
      matches.push(`Line ${lineNo}: \`${m[0].trim().slice(0, 80)}\``);
      if (matches.length >= 3) break;
    }
    if (matches.length > 0) {
      findings.push(finding(check.label, matches.join(' | '), check.explanation, check.why, check.severity));
    }
  }

  // Line-by-line checks
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (/\bchown\s+root/.test(line)) {
      findings.push(finding('Ownership change to root', `Line ${ln}: \`${line.trim().slice(0, 80)}\``,
        'Changes file ownership to root.', 'May enable privilege escalation.', 'medium'));
    }
  });

  return findings;
}

// ─── Python analysis ──────────────────────────────────────────────────────────

/**
 * @param {string} code
 * @returns {Array<object>} findings
 */
function analyzePython(code) {
  const findings = [];
  const lineOf = buildLineMap(code);

  const checks = [
    {
      re: /\bos\.system\s*\(|\bsubprocess\.(?:call|run|Popen|check_output)\s*\(/g,
      label: 'Shell command execution',
      explanation: 'Executes operating system shell commands from Python.',
      why: 'Can run arbitrary commands on the host system.',
      severity: 'high',
    },
    {
      re: /\beval\s*\(|\bexec\s*\(/g,
      label: 'Dynamic code execution (eval/exec)',
      explanation: 'Executes arbitrary Python code from a string.',
      why: 'Allows running any code, often used to hide malicious payloads.',
      severity: 'critical',
    },
    {
      re: /__import__\s*\(\s*['"](?:os|subprocess|socket|ctypes)['"]/g,
      label: 'Obfuscated module import',
      explanation: 'Imports dangerous modules using __import__() to avoid detection.',
      why: 'Hides sensitive imports from static analysis tools.',
      severity: 'high',
    },
    {
      re: /\bsocket\.connect\s*\(/g,
      label: 'Network socket connection',
      explanation: 'Opens a TCP/UDP socket connection to a remote host.',
      why: 'Used for C2 (command and control) channels or data exfiltration.',
      severity: 'high',
    },
    {
      re: /open\s*\(\s*['"]\/etc\/(?:passwd|shadow|sudoers)/g,
      label: 'Sensitive file read',
      explanation: 'Reads critical system authentication files.',
      why: 'Provides access to password hashes and privilege data.',
      severity: 'high',
    },
    {
      re: /\bpickle\.loads?\s*\(/g,
      label: 'Unsafe deserialization (pickle)',
      explanation: 'Deserializes arbitrary Python objects from untrusted data.',
      why: 'pickle.loads() of untrusted data = arbitrary code execution.',
      severity: 'critical',
    },
    {
      re: /\bctypes\.(?:cdll|windll|CDLL|WinDLL)\b/g,
      label: 'Native code execution (ctypes)',
      explanation: 'Loads and calls native shared library (DLL/.so) code.',
      why: 'Bypasses Python security model to execute C-level code.',
      severity: 'high',
    },
    {
      re: /requests\.(?:get|post|put)\s*\(.*\n.*(?:open|write)/gm,
      label: 'Download and write to file',
      explanation: 'Downloads remote content and saves it to disk.',
      why: 'Download-then-execute pattern is common in droppers.',
      severity: 'high',
    },
    {
      re: /base64\.b64decode\s*\(.*\).*(?:eval|exec)/g,
      label: 'Base64-encoded payload execution',
      explanation: 'Decodes base64 data and executes it.',
      why: 'Classic obfuscation technique for hiding malicious payloads.',
      severity: 'critical',
    },
    {
      re: /\bshutil\.rmtree\s*\(\s*['"]\//g,
      label: 'Recursive directory deletion',
      explanation: 'Recursively deletes a directory tree starting from root.',
      why: 'Can destroy the file system if given a root or critical path.',
      severity: 'critical',
    },
    {
      re: /\bos\.setuid\s*\(\s*0\s*\)/g,
      label: 'Privilege escalation (setuid 0)',
      explanation: 'Sets the process user ID to root (0).',
      why: 'Direct privilege escalation to root.',
      severity: 'critical',
    },
    {
      re: /\bpynput\b|\bkeylogger\b|\bKeyboard\.Listener\b/g,
      label: 'Keystroke / input capture',
      explanation: 'Uses a keylogger or input-capture library.',
      why: 'Can steal passwords, credit card numbers, and sensitive input.',
      severity: 'critical',
    },
  ];

  for (const check of checks) {
    const re = new RegExp(check.re.source, check.re.flags);
    const matches = [];
    let m;
    while ((m = re.exec(code)) !== null) {
      const lineNo = lineOf(m.index);
      matches.push(`Line ${lineNo}: \`${m[0].trim().slice(0, 80)}\``);
      if (matches.length >= 3) break;
    }
    if (matches.length > 0) {
      findings.push(finding(check.label, matches.join(' | '), check.explanation, check.why, check.severity));
    }
  }

  return findings;
}

// ─── PowerShell analysis ──────────────────────────────────────────────────────

/**
 * @param {string} code
 * @returns {Array<object>} findings
 */
function analyzePowerShell(code) {
  const findings = [];
  const lineOf = buildLineMap(code);

  const checks = [
    {
      re: /\bInvoke-Expression\b|\bIEX\b/gi,
      label: 'Dynamic code execution (IEX)',
      explanation: 'Executes a string as a PowerShell command.',
      why: 'Invoke-Expression is the PowerShell equivalent of eval — primary obfuscation tool.',
      severity: 'critical',
    },
    {
      re: /-ExecutionPolicy\s+(?:Bypass|Unrestricted)|Set-ExecutionPolicy\s+(?:Bypass|Unrestricted)/gi,
      label: 'Execution policy bypass',
      explanation: 'Disables or bypasses PowerShell script execution restrictions.',
      why: 'Allows running unsigned or untrusted scripts system-wide.',
      severity: 'high',
    },
    {
      re: /\.DownloadString\s*\(|\.DownloadFile\s*\(|New-Object\s+Net\.WebClient/gi,
      label: 'Remote content download (WebClient)',
      explanation: 'Downloads remote files or script content.',
      why: 'Used to pull malicious payloads from attacker-controlled servers.',
      severity: 'high',
    },
    {
      re: /HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run/gi,
      label: 'Registry persistence (Run key)',
      explanation: 'Modifies the Windows Run registry key.',
      why: 'Ensures malicious code runs at every user logon.',
      severity: 'critical',
    },
    {
      re: /Add-MpPreference\s+-ExclusionPath/gi,
      label: 'Windows Defender exclusion',
      explanation: 'Adds a path exclusion to Windows Defender.',
      why: 'Prevents antivirus from scanning malicious files in the excluded path.',
      severity: 'critical',
    },
    {
      re: /Disable-WindowsOptionalFeature/gi,
      label: 'Windows feature disable',
      explanation: 'Disables a Windows Optional Feature.',
      why: 'Can disable security features or defensive components.',
      severity: 'medium',
    },
    {
      re: /\bNew-Service\b/gi,
      label: 'New Windows service (persistence)',
      explanation: 'Creates a new Windows service.',
      why: 'Services run at boot and provide persistent execution.',
      severity: 'high',
    },
    {
      re: /Start-Process\b[^;]*-Verb\s+RunAs/gi,
      label: 'Elevated process launch (RunAs)',
      explanation: 'Starts a process with elevated (admin) privileges.',
      why: 'UAC bypass pattern for privilege escalation.',
      severity: 'high',
    },
    {
      re: /ConvertTo-SecureString\b[^;]*-AsPlainText/gi,
      label: 'Plaintext credential handling',
      explanation: 'Converts a plain-text string to a SecureString.',
      why: 'Credentials stored in plain text in scripts are trivially exposed.',
      severity: 'high',
    },
    {
      re: /-EncodedCommand\b/gi,
      label: 'Base64-encoded command (-EncodedCommand)',
      explanation: 'Passes a base64-encoded command to PowerShell.',
      why: 'Obfuscates the actual command being executed from logs and scanners.',
      severity: 'critical',
    },
    {
      re: /Compress-Archive\b.*\|\s*(?:Invoke|curl|wget|nc)/gi,
      label: 'Data compression and exfiltration pattern',
      explanation: 'Archives data and pipes it to a network tool.',
      why: 'Classic exfiltration pattern — compress sensitive data and send it out.',
      severity: 'critical',
    },
    {
      re: /\bGet-Credential\b/gi,
      label: 'Credential capture (Get-Credential)',
      explanation: 'Prompts the user for credentials.',
      why: 'Can be used to harvest credentials via fake prompts.',
      severity: 'high',
    },
  ];

  for (const check of checks) {
    const re = new RegExp(check.re.source, check.re.flags);
    const matches = [];
    let m;
    while ((m = re.exec(code)) !== null) {
      const lineNo = lineOf(m.index);
      matches.push(`Line ${lineNo}: \`${m[0].trim().slice(0, 80)}\``);
      if (matches.length >= 3) break;
    }
    if (matches.length > 0) {
      findings.push(finding(check.label, matches.join(' | '), check.explanation, check.why, check.severity));
    }
  }

  return findings;
}

// ─── Generic / multi-language checks ─────────────────────────────────────────

/**
 * Language-agnostic obfuscation / encoding checks.
 * @param {string} code
 * @returns {Array<object>} findings
 */
function analyzeGeneric(code) {
  const findings = [];

  // Require surrounding whitespace or quotes/brackets to avoid matching identifiers
  if (/(?:^|['"`\s(=])[A-Za-z0-9+/]{40,}={0,2}(?:['"`\s),;]|$)/m.test(code)) {
    findings.push(finding(
      'Long base64-like string detected',
      'Base64 pattern found in snippet',
      'A long base64-encoded string (40+ chars) is present in the code.',
      'Frequently used to hide URLs, shellcode, or command strings from inspection.',
      'medium',
    ));
  }

  if (/\\x[0-9a-fA-F]{2}/.test(code)) {
    findings.push(finding(
      'Hex-escaped bytes (\\xNN)',
      '\\xNN pattern detected',
      'Hexadecimal character escapes found.',
      'Used to encode shellcode or obfuscate strings.',
      'medium',
    ));
  }

  if (/\\u[0-9a-fA-F]{4}/.test(code)) {
    findings.push(finding(
      'Unicode escape sequences (\\uNNNN)',
      '\\uNNNN pattern detected',
      'Unicode escape sequences found in code.',
      'Can be used to obfuscate identifiers or strings.',
      'low',
    ));
  }

  // Zero-width characters (invisible text injection)
  if (/[\u200B-\u200D\uFEFF\u2060\u180E]/.test(code)) {
    findings.push(finding(
      'Zero-width / invisible characters detected',
      'Unicode zero-width characters present',
      'Invisible Unicode characters found embedded in the code.',
      'Can hide malicious tokens or alter parsing of identifiers.',
      'high',
    ));
  }

  return findings;
}

// ─── Command breakdown helper ─────────────────────────────────────────────────

/**
 * Extract notable commands/functions as a summary breakdown list.
 * @param {string} code
 * @param {'bash'|'python'|'powershell'|'unknown'} language
 * @returns {string[]}
 */
function buildCommandBreakdown(code, language) {
  const results = [];
  const lines = code.split('\n').slice(0, 50); // only first 50 lines

  if (language === 'bash') {
    lines.forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const m = t.match(/^([a-z_][\w-]*)\b/);
      if (m && !['fi', 'do', 'done', 'then', 'else', 'elif', 'esac', 'in'].includes(m[1])) {
        results.push(t.slice(0, 80));
      }
    });
  } else if (language === 'python') {
    const imports = [...code.matchAll(/^(?:import|from)\s+[\w.]+/gm)].map((m) => m[0]);
    const calls   = [...code.matchAll(/\b\w+\.\w+\s*\(/g)].slice(0, 12).map((m) => m[0].slice(0, 60));
    results.push(...imports, ...calls);
  } else if (language === 'powershell') {
    const cmdlets = [...code.matchAll(/\b[A-Z][a-z]+-\w+/g)].slice(0, 15).map((m) => m[0]);
    results.push(...cmdlets);
  }

  return [...new Set(results)].slice(0, 20);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyze a code snippet for suspicious or malicious patterns.
 *
 * @param {string} code - raw code string
 * @returns {{
 *   language: string,
 *   riskLevel: 'none'|'low'|'medium'|'high'|'critical',
 *   riskScore: number,
 *   findings: Array<{label:string,match:string,explanation:string,why:string,severity:string,score:number}>,
 *   commandBreakdown: string[],
 * }}
 */
export function analyzeCode(code) {
  if (!code || typeof code !== 'string' || code.trim().length < 3) {
    return { language: 'unknown', riskLevel: 'none', riskScore: 0, findings: [], commandBreakdown: [] };
  }

  const language = detectLanguage(code);

  let findings = [];
  if (language === 'bash')       findings = analyzeBash(code);
  else if (language === 'python') findings = analyzePython(code);
  else if (language === 'powershell') findings = analyzePowerShell(code);

  // Always run generic checks
  findings = findings.concat(analyzeGeneric(code));

  // Deduplicate by label
  const seen = new Set();
  findings = findings.filter((f) => {
    if (seen.has(f.label)) return false;
    seen.add(f.label);
    return true;
  });

  const riskScore = Math.min(100, findings.reduce((s, f) => s + (f.score || 0), 0));

  let riskLevel = 'none';
  if (riskScore >= 40) riskLevel = 'critical';
  else if (riskScore >= 25) riskLevel = 'high';
  else if (riskScore >= 15) riskLevel = 'medium';
  else if (riskScore > 0)   riskLevel = 'low';

  const commandBreakdown = buildCommandBreakdown(code, language);

  return { language, riskLevel, riskScore, findings, commandBreakdown };
}
