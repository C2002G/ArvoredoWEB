import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import QRCode from "qrcode";
import { logger } from "./logger";

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

// Largura do layout em colunas (igual a PRINTER_LAYOUT.colunas em print-layout.ts)
const CUPOM_COLS = 48;

export type PrintOptions = { qrUrl?: string };

// Script GDI: calcula a fonte para as 48 colunas caberem na largura util do driver.
// (somente ASCII: o arquivo .ps1 e lido pelo Windows PowerShell 5.1)
const PS_GDI_SCRIPT = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$TextFile,
  [Parameter(Mandatory=$true)][string]$Printer,
  [int]$Cols = 48,
  [double]$PrintWidthMm = 0,
  [string]$QrFile = ""
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$text  = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$lines = $text -split "\r?\n"
$qr = $null
if ($QrFile -and (Test-Path -LiteralPath $QrFile)) { $qr = [System.Drawing.Image]::FromFile($QrFile) }

$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = $Printer
if (-not $pd.PrinterSettings.IsValid) { throw "Impressora invalida: $Printer" }
$pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController

# Medidas em centesimos de polegada (unidade da impressao no .NET)
$paper  = $pd.DefaultPageSettings.PaperSize
$usable = $pd.DefaultPageSettings.PrintableArea.Width
if ($PrintWidthMm -gt 0) { $usable = $PrintWidthMm / 25.4 * 100 }
elseif ($usable -le 0 -or $usable -gt 340) { $usable = 283 }   # driver sem area util (ou A4): assume 72mm

# Courier New tem largura de 0.6 em por caractere; 0.97 deixa folga na borda
$fontPt = [math]::Floor(($usable / 100.0 * 72.0 * 0.97) / ($Cols * 0.6001) * 4.0) / 4.0
if ($fontPt -lt 4) { $fontPt = 4 }
$font   = New-Object System.Drawing.Font("Courier New", [single]$fontPt, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
$lineH  = $fontPt / 72.0 * 100.0 * 1.1329
$qrSize = [math]::Round($usable * 0.45)

$qrBlock = 0
if ($qr -ne $null) { $qrBlock = $qrSize + 10 }
$height = [int][math]::Max(3000, [math]::Ceiling($lines.Count * $lineH + $qrBlock + 60))
$custom = New-Object System.Drawing.Printing.PaperSize("Cupom", [int]$paper.Width, $height)
$custom.RawKind = 256
$pd.DefaultPageSettings.PaperSize = $custom
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

$sf = New-Object System.Drawing.StringFormat([System.Drawing.StringFormat]::GenericTypographic)

$pd.add_PrintPage({
  param($s, $e)
  $g = $e.Graphics
  $y = 2.0
  foreach ($line in $lines) {
    $g.DrawString($line, $font, [System.Drawing.Brushes]::Black, 0.0, $y, $sf)
    $y += $lineH
  }
  if ($qr -ne $null) {
    $y += 8
    $x = ($usable - $qrSize) / 2
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($qr, [single]$x, [single]$y, [single]$qrSize, [single]$qrSize)
  }
  $e.HasMorePages = $false
}.GetNewClosure())

try { $pd.Print() } finally { $font.Dispose(); if ($qr -ne $null) { $qr.Dispose() } }
`;

function envNumber(name: string, fallback: number) {
  const n = Number(process.env[name]?.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function printViaWindowsDriver(text: string, printer: string, opts: PrintOptions) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const textFile = path.join(os.tmpdir(), `arvoredo_cupom_${id}.txt`);
  const scriptFile = path.join(os.tmpdir(), `arvoredo_print_${id}.ps1`);
  const qrFile = opts.qrUrl ? path.join(os.tmpdir(), `arvoredo_qr_${id}.png`) : null;

  try {
    await fs.writeFile(textFile, text, "utf8");
    await fs.writeFile(scriptFile, PS_GDI_SCRIPT, "utf8");
    if (qrFile && opts.qrUrl) {
      const png = await QRCode.toBuffer(opts.qrUrl, { type: "png", scale: 6, margin: 2, errorCorrectionLevel: "M" });
      await fs.writeFile(qrFile, png);
    }

    const args = [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile,
      "-TextFile", textFile,
      "-Printer", printer,
      "-Cols", String(CUPOM_COLS),
      "-PrintWidthMm", String(envNumber("PRINTER_PRINT_WIDTH_MM", 0)),
    ];
    if (qrFile) args.push("-QrFile", qrFile);

    await execFileAsync("powershell.exe", args, { windowsHide: true, timeout: 20000 });
  } finally {
    for (const f of [textFile, scriptFile, qrFile]) {
      if (f) await fs.rm(f, { force: true }).catch(() => undefined);
    }
  }
}

// Rede de seguranca: se o GDI falhar, o QR Code sai como URL em texto.
function qrAsText(url: string) {
  const W = 48;
  const line = "-".repeat(W);
  const center = (s: string) => " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
  const urlLines = url.match(/.{1,48}/g) ?? [url];
  return ["", line, center("QR Code - ESCANEAR ABAIXO"), line, ...urlLines, line, center("Use o celular para escanear"), ""].join("\r\n");
}

export async function printTextToWindowsPrinter(
  text: string,
  printerName?: string,
  opts: PrintOptions = {},
): Promise<"gdi" | "texto"> {
  if (process.platform !== "win32") {
    throw new Error("A impressão por USB só é suportada no Windows nesta versão.");
  }

  const name = printerName?.trim() || (await resolvePrinterName());

  try {
    await printViaWindowsDriver(text, name, opts);
    logger.info(`Cupom impresso via driver Windows (GDI): ${name}`);
    return "gdi";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Impressão GDI falhou (${msg}). Usando Out-Printer (sem ajuste de largura).`);
  }

  const finalText = opts.qrUrl ? text + "\r\n" + qrAsText(opts.qrUrl) : text;
  const tempFile = path.join(os.tmpdir(), `arvoredo_print_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
  await fs.writeFile(tempFile, finalText, "utf8");

  try {
    await execPowershellPrint(tempFile, name);
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
  }
  return "texto";
}
