import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WindowsPrinterInfo = {
  name: string;
  isDefault: boolean;
};

const AUTO_PRINTER_HINTS = ["elgin", "i7", "i8", "usb", "pos", "termica", "termica"];

async function execPowershell(command: string) {
  const { stdout, stderr } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], {
    windowsHide: true,
    timeout: 20000,
  });

  if (stderr && stderr.trim()) {
    throw new Error(stderr.trim());
  }

  return stdout.trim();
}

/**
 * Não use Out-Printer -Width: em várias impressoras térmicas isso restringe a área
 * e o cupom fica com texto “pela metade” da largura. O controle fica no texto (48 cols).
 * Opcional: PRINTER_LINE_WIDTH (número) para forçar -Width quando necessário.
 */
async function execPowershellPrint(tempFilePath: string, printerName: string) {
  const safeFilePath = tempFilePath.replace(/'/g, "''");
  const safePrinter = printerName.replace(/'/g, "''");
  const w = process.env.PRINTER_LINE_WIDTH?.trim();
  const widthArg =
    w && /^\d+$/.test(w) && Number(w) > 0 ? ` -Width ${Number(w)}` : "";

  if (widthArg) {
    try {
      await execPowershell(
        `Get-Content -Raw -Encoding utf8 '${safeFilePath}' | Out-Printer -Name '${safePrinter}'${widthArg}`,
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("namedparameternotfound")) {
        throw error;
      }
    }
  }

  await execPowershell(
    `Get-Content -Raw -Encoding utf8 '${safeFilePath}' | Out-Printer -Name '${safePrinter}'`,
  );
}

export async function listWindowsPrinters(): Promise<WindowsPrinterInfo[]> {
  const raw = await execPowershell(
    "Get-Printer | Select-Object -Property Name,Default | ConvertTo-Json -Compress"
  );

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row: any) => ({
    name: String(row.Name || row.name || "").trim(),
    isDefault: Boolean(row.Default || row.default),
  }));
}

function normalizePrinterName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitConfiguredCandidates(configuredName?: string) {
  if (!configuredName) {
    return [];
  }

  return configuredName
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scorePrinterName(name: string) {
  const normalized = normalizePrinterName(name);
  let score = 0;

  for (const hint of AUTO_PRINTER_HINTS) {
    if (normalized.includes(hint)) {
      score += hint === "elgin" || hint === "i7" ? 6 : 2;
    }
  }

  return score;
}

function resolveFromConfiguredCandidates(printers: WindowsPrinterInfo[], configuredCandidates: string[]) {
  for (const configured of configuredCandidates) {
    const exactMatch = printers.find((printer) => printer.name.toLowerCase() === configured.toLowerCase());
    if (exactMatch) {
      return exactMatch.name;
    }

    const normalizedConfigured = normalizePrinterName(configured);
    const fuzzyMatch = printers.find((printer) => {
      const normalizedPrinter = normalizePrinterName(printer.name);
      return (
        normalizedPrinter.includes(normalizedConfigured) ||
        normalizedConfigured.includes(normalizedPrinter)
      );
    });

    if (fuzzyMatch) {
      return fuzzyMatch.name;
    }
  }

  return null;
}

export async function resolvePrinterName(): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("A impressão por USB só é suportada no Windows nesta versão.");
  }

  const configured = process.env.PRINTER_NAME?.trim();
  const configuredCandidates = splitConfiguredCandidates(configured);
  const printers = await listWindowsPrinters();

  if (printers.length === 0) {
    throw new Error("Nenhuma impressora instalada foi encontrada no Windows.");
  }

  const configuredMatch = resolveFromConfiguredCandidates(printers, configuredCandidates);
  if (configuredMatch) {
    return configuredMatch;
  }

  const bestByName = printers
    .map((printer) => ({ printer, score: scorePrinterName(printer.name) }))
    .sort((a, b) => b.score - a.score)[0];

  if (bestByName && bestByName.score > 0) {
    return bestByName.printer.name;
  }

  const defaultPrinter = printers.find((printer) => printer.isDefault);
  if (defaultPrinter) {
    return defaultPrinter.name;
  }

  if (printers.length === 1) {
    return printers[0].name;
  }

  const installed = printers.map((printer) => printer.name).join(", ");
  if (configured) {
    throw new Error(
      `Impressora configurada não encontrada: ${configured}. Impressoras instaladas: ${installed}.`
    );
  }

  throw new Error(
    `Nenhuma impressora adequada encontrada automaticamente. Defina PRINTER_NAME no .env. Impressoras instaladas: ${installed}.`
  );
}

export async function printTextToWindowsPrinter(text: string, printerName?: string) {
  if (process.platform !== "win32") {
    throw new Error("A impressão por USB só é suportada no Windows nesta versão.");
  }

  const name = printerName?.trim() || (await resolvePrinterName());
  const tempFile = path.join(os.tmpdir(), `arvoredo_print_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);

  await fs.writeFile(tempFile, text, "utf8");

  try {
    await execPowershellPrint(tempFile, name);
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
  }
}
