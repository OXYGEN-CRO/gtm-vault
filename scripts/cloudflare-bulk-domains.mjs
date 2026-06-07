#!/usr/bin/env node
// Bulk Cloudflare Registrar helper.
//
// Safe default:
//   `check` performs availability/pricing checks only.
//   `purchase` performs a fresh check and previews by default.
//   Actual registration requires --execute plus CLOUDFLARE_BULK_DOMAINS_CONFIRM.

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const API_BASE = "https://api.cloudflare.com/client/v4";
const DOMAIN_CHECK_BATCH_SIZE = 20;
const DEFAULT_PURCHASE_CONCURRENCY = 1;
const CONFIRMATION_PHRASE = "I_UNDERSTAND_THIS_BUYS_DOMAINS";
const TERMINAL_STATES = new Set(["succeeded", "failed", "action_required"]);

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const rows = await loadDomainRows(options.csvPath);
  const env = readCloudflareEnv();

  if (options.command === "check") {
    const checked = await checkRows(rows, env);
    const report = buildReport({ rows, checked, options, mode: "check" });
    await maybeWriteJson(options.outPath, report);
    if (options.json) {
      printJson(report);
      return;
    }
    printCheckReport(report);
    return;
  }

  if (options.command === "purchase") {
    const checked = await checkRows(rows, env);
    const report = buildReport({ rows, checked, options, mode: "purchase" });
    if (!options.json) {
      printPurchasePreview(report, options);
    }
    validatePurchasePlan(report, options);

    if (!options.execute) {
      if (!options.json) {
        process.stdout.write("\nPreview only. Re-run with --execute and the confirmation env var to register domains.\n");
      }
      await maybeWriteJson(options.outPath, report);
      if (options.json) {
        printJson(report);
      }
      return;
    }

    enforcePurchaseConfirmation();
    const purchased = await purchaseEligibleDomains(report.eligible, env, options);
    const completed = {
      ...report,
      executed: true,
      purchased,
    };
    await maybeWriteJson(options.outPath, completed);
    if (options.json) {
      printJson(completed);
      return;
    }
    printPurchaseResults(completed);
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

function parseArgs(args) {
  const options = {
    command: null,
    csvPath: null,
    outPath: null,
    execute: false,
    help: false,
    json: false,
    maxTotalUsd: null,
    poll: false,
    pollIntervalMs: 3000,
    pollTimeoutMs: 120000,
    purchaseConcurrency: DEFAULT_PURCHASE_CONCURRENCY,
  };

  const command = args.shift();
  if (!command || command === "-h" || command === "--help") {
    options.help = true;
    return options;
  }
  options.command = command;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--csv") {
      options.csvPath = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.outPath = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-total-usd") {
      options.maxTotalUsd = parseMoney(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--poll") {
      options.poll = true;
      continue;
    }
    if (arg === "--poll-timeout-ms") {
      options.pollTimeoutMs = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--poll-interval-ms") {
      options.pollIntervalMs = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--purchase-concurrency") {
      options.purchaseConcurrency = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      return options;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!["check", "purchase"].includes(options.command)) {
    throw new Error(`Command must be "check" or "purchase". Received: ${options.command}`);
  }
  if (!options.csvPath) {
    throw new Error("Missing --csv <path>.");
  }
  if (options.command === "check" && options.execute) {
    throw new Error("--execute is only valid with the purchase command.");
  }
  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function parseMoney(value, argName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${argName} must be a non-negative number.`);
  }
  return parsed;
}

function parsePositiveInteger(value, argName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${argName} must be a positive integer.`);
  }
  return parsed;
}

function printUsage() {
  process.stdout.write(`Usage:
  node scripts/cloudflare-bulk-domains.mjs check --csv <domains.csv> [--out check.json] [--json]
  node scripts/cloudflare-bulk-domains.mjs purchase --csv <domains.csv> --max-total-usd <amount> [--out result.json] [--json]
  CLOUDFLARE_BULK_DOMAINS_CONFIRM=${CONFIRMATION_PHRASE} \\
    node scripts/cloudflare-bulk-domains.mjs purchase --csv <domains.csv> --max-total-usd <amount> --execute --poll

Environment:
  CLOUDFLARE_ACCOUNT_ID or ACCOUNT_ID
  CLOUDFLARE_API_TOKEN

CSV columns:
  domain        Required. Fully qualified domain, e.g. example.com.
  years         Optional. 1-10. Defaults to Cloudflare/registry minimum when omitted.
  auto_renew    Optional. true/false. Defaults to false.
  privacy_mode  Optional. Defaults to redaction.
  note          Optional. Carried through reports only.

Safety:
  check never registers domains.
  purchase previews by default.
  purchase --execute re-checks price/availability immediately before registration.
  purchase --execute requires --max-total-usd and CLOUDFLARE_BULK_DOMAINS_CONFIRM=${CONFIRMATION_PHRASE}.
`);
}

async function loadDomainRows(csvPath) {
  const text = await readFile(csvPath, "utf8");
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsed.length === 0) {
    throw new Error(`No rows found in ${csvPath}.`);
  }

  const headers = parsed[0].map((header) => header.trim().toLowerCase());
  const hasHeader = headers.some((header) => ["domain", "domain_name", "name"].includes(header));
  const dataRows = hasHeader ? parsed.slice(1) : parsed;
  const rows = [];
  const seen = new Set();

  for (const [rowIndex, cells] of dataRows.entries()) {
    if (cells.every((cell) => cell.trim() === "")) continue;

    const object = hasHeader
      ? Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]))
      : { domain: cells[0]?.trim() ?? "" };

    const domain = normalizeDomain(object.domain || object.domain_name || object.name);
    if (seen.has(domain)) {
      throw new Error(`Duplicate domain in CSV: ${domain}`);
    }
    seen.add(domain);

    const years = object.years ? parseYears(object.years, domain) : null;
    const autoRenew = object.auto_renew ? parseBoolean(object.auto_renew, `auto_renew for ${domain}`) : false;
    const privacyMode = object.privacy_mode || "redaction";
    if (!["redaction", "off"].includes(privacyMode)) {
      throw new Error(`privacy_mode for ${domain} must be "redaction" or "off".`);
    }

    rows.push({
      row_number: hasHeader ? rowIndex + 2 : rowIndex + 1,
      domain,
      years,
      auto_renew: autoRenew,
      privacy_mode: privacyMode,
      note: object.note || "",
    });
  }

  if (rows.length === 0) {
    throw new Error(`No domain rows found in ${csvPath}.`);
  }

  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSV has an unterminated quoted field.");
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((parsedRow) => parsedRow.some((parsedCell) => parsedCell.trim() !== ""));
}

function normalizeDomain(value) {
  const domain = String(value ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("Each row must include a domain.");
  }
  if (domain.includes("://") || domain.includes("/") || domain.includes("@")) {
    throw new Error(`Domain must be a hostname only, not a URL/email: ${domain}`);
  }
  if (!/^[\x00-\x7F]+$/.test(domain)) {
    throw new Error(`Cloudflare Registrar does not support IDN/Unicode domains here: ${domain}`);
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    throw new Error(`Invalid fully qualified domain: ${domain}`);
  }
  return domain;
}

function parseYears(value, domain) {
  const years = Number(value);
  if (!Number.isInteger(years) || years < 1 || years > 10) {
    throw new Error(`years for ${domain} must be an integer from 1 to 10.`);
  }
  return years;
}

function parseBoolean(value, label) {
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  throw new Error(`${label} must be true or false.`);
}

function readCloudflareEnv() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID or ACCOUNT_ID is not set.");
  }
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set.");
  }

  return {
    accountId: accountId.trim(),
    token: token.trim(),
  };
}

async function checkRows(rows, env) {
  const byDomain = new Map(rows.map((row) => [row.domain, row]));
  const domains = rows.map((row) => row.domain);
  const checked = [];

  for (const batch of chunk(domains, DOMAIN_CHECK_BATCH_SIZE)) {
    const response = await cloudflareFetch(env, `/accounts/${env.accountId}/registrar/domain-check`, {
      method: "POST",
      body: { domains: batch },
    });

    const results = response.result?.domains ?? [];
    for (const result of results) {
      checked.push(normalizeCheckResult(result, byDomain.get(result.name)));
    }

    const returned = new Set(results.map((result) => result.name));
    for (const domain of batch) {
      if (!returned.has(domain)) {
        checked.push({
          ...baseCheckResult(byDomain.get(domain)),
          registrable: false,
          purchase_eligible: false,
          reason: "not_returned_by_cloudflare",
        });
      }
    }
  }

  return checked;
}

function normalizeCheckResult(result, row) {
  const normalized = {
    ...baseCheckResult(row),
    domain: result.name,
    registrable: Boolean(result.registrable),
    tier: result.tier ?? null,
    reason: result.reason ?? null,
    pricing: result.pricing ?? null,
  };

  normalized.estimated_total = estimateTotal(normalized);
  normalized.purchase_eligible = normalized.registrable === true && normalized.tier === "standard";

  if (normalized.registrable && normalized.tier === "premium") {
    normalized.reason = "domain_premium";
    normalized.purchase_eligible = false;
  }

  return normalized;
}

function baseCheckResult(row) {
  return {
    row_number: row.row_number,
    domain: row.domain,
    years: row.years,
    auto_renew: row.auto_renew,
    privacy_mode: row.privacy_mode,
    note: row.note,
    registrable: false,
    tier: null,
    reason: null,
    pricing: null,
    estimated_total: null,
    purchase_eligible: false,
  };
}

function estimateTotal(check) {
  if (!check.pricing) return null;
  const years = check.years ?? 1;
  const registrationCost = Number(check.pricing.registration_cost);
  const renewalCost = Number(check.pricing.renewal_cost);
  if (!Number.isFinite(registrationCost) || !Number.isFinite(renewalCost)) return null;
  return roundMoney(registrationCost + Math.max(0, years - 1) * renewalCost);
}

function buildReport({ rows, checked, options, mode }) {
  const eligible = checked.filter((row) => row.purchase_eligible);
  const skipped = checked.filter((row) => !row.purchase_eligible);
  const totalEstimatedUsd = roundMoney(
    eligible.reduce((sum, row) => sum + (row.estimated_total ?? 0), 0),
  );

  return {
    mode,
    executed: false,
    checked_at: new Date().toISOString(),
    csv_path: options.csvPath,
    requested_count: rows.length,
    eligible_count: eligible.length,
    skipped_count: skipped.length,
    total_estimated_usd: totalEstimatedUsd,
    max_total_usd: options.maxTotalUsd,
    eligible,
    skipped,
  };
}

function validatePurchasePlan(report, options) {
  if (options.execute && report.eligible_count === 0) {
    throw new Error("No purchase-eligible domains after the fresh availability check.");
  }
  if (options.execute && options.maxTotalUsd === null) {
    throw new Error("purchase --execute requires --max-total-usd.");
  }
  if (options.maxTotalUsd !== null && report.total_estimated_usd > options.maxTotalUsd) {
    throw new Error(
      `Estimated total $${formatMoney(report.total_estimated_usd)} exceeds --max-total-usd $${formatMoney(options.maxTotalUsd)}.`,
    );
  }
}

function enforcePurchaseConfirmation() {
  if (process.env.CLOUDFLARE_BULK_DOMAINS_CONFIRM !== CONFIRMATION_PHRASE) {
    throw new Error(
      `Refusing to register domains. Set CLOUDFLARE_BULK_DOMAINS_CONFIRM=${CONFIRMATION_PHRASE} to acknowledge this is billable and non-refundable.`,
    );
  }
}

async function purchaseEligibleDomains(eligible, env, options) {
  return runPool(eligible, options.purchaseConcurrency, async (row) => {
    try {
      const body = {
        domain_name: row.domain,
        auto_renew: row.auto_renew,
        privacy_mode: row.privacy_mode,
      };
      if (row.years !== null) body.years = row.years;

      const response = await cloudflareFetch(env, `/accounts/${env.accountId}/registrar/registrations`, {
        method: "POST",
        headers: { Prefer: "respond-async" },
        body,
      });

      const workflow = response.result;
      const result = {
        domain: row.domain,
        ok: true,
        requested: body,
        workflow,
        final_status: null,
      };

      if (options.poll && workflow?.links?.self) {
        result.final_status = await pollWorkflow(env, workflow.links.self, options);
      }

      return result;
    } catch (error) {
      return {
        domain: row.domain,
        ok: false,
        error: error.message,
      };
    }
  });
}

async function pollWorkflow(env, selfLink, options) {
  const startedAt = Date.now();
  let last = null;

  while (Date.now() - startedAt <= options.pollTimeoutMs) {
    const response = await cloudflareFetch(env, selfLink, { method: "GET" });
    last = response.result;
    if (last?.state && TERMINAL_STATES.has(last.state)) {
      return last;
    }
    await sleep(options.pollIntervalMs);
  }

  return {
    state: "poll_timeout",
    completed: false,
    last_status: last,
  };
}

async function cloudflareFetch(env, path, options) {
  const url = path.startsWith("https://") ? path : `${API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${env.token}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok || parsed?.success === false) {
    const message = formatCloudflareError(parsed) || `${response.status} ${response.statusText}`;
    throw new Error(`Cloudflare API error for ${options.method} ${url}: ${message}`);
  }

  return parsed;
}

function formatCloudflareError(parsed) {
  const errors = parsed?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors.map((error) => `${error.code ?? "unknown"} ${error.message ?? "unknown error"}`).join("; ");
}

async function maybeWriteJson(outPath, report) {
  if (!outPath) return;
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printJson(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function printCheckReport(report) {
  process.stdout.write(`Checked ${report.requested_count} domain(s). Eligible: ${report.eligible_count}. Estimated total: $${formatMoney(report.total_estimated_usd)}.\n`);
  printDomainTable(report.eligible, "Eligible");
  printDomainTable(report.skipped, "Skipped");
}

function printPurchasePreview(report, options) {
  process.stdout.write(`Purchase preview for ${report.eligible_count} domain(s). Estimated total: $${formatMoney(report.total_estimated_usd)}.\n`);
  if (options.maxTotalUsd !== null) {
    process.stdout.write(`Spend cap: $${formatMoney(options.maxTotalUsd)}.\n`);
  }
  printDomainTable(report.eligible, "Will register if executed");
  printDomainTable(report.skipped, "Will skip");
}

function printPurchaseResults(report) {
  process.stdout.write(`\nSubmitted ${report.purchased.length} registration workflow(s).\n`);
  for (const item of report.purchased) {
    if (!item.ok) {
      process.stdout.write(`- ${item.domain}: failed to submit (${item.error})\n`);
      continue;
    }
    const state = item.final_status?.state ?? item.workflow?.state ?? "unknown";
    process.stdout.write(`- ${item.domain}: ${state}\n`);
  }
}

function printDomainTable(rows, title) {
  if (rows.length === 0) return;
  process.stdout.write(`\n${title}\n`);
  process.stdout.write("domain | years | auto_renew | price | tier/reason\n");
  process.stdout.write("--- | ---: | --- | ---: | ---\n");
  for (const row of rows) {
    const years = row.years ?? "default";
    const price = row.estimated_total === null ? "-" : `$${formatMoney(row.estimated_total)}`;
    const reason = row.purchase_eligible ? row.tier : row.reason ?? row.tier ?? "not_registrable";
    process.stdout.write(`${row.domain} | ${years} | ${row.auto_renew} | ${price} | ${reason}\n`);
  }
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
