/**
 * Job search via Google Custom Search JSON API → Google Sheets.
 *
 * - searchJobs(): runs a Google query (supports `site:`, `intitle:`, quotes, OR …)
 *   and returns up to `max` results, paginating 10-per-page.
 * - saveToSheet(): appends those results as rows to a shared Google Sheet,
 *   authenticating with a service account.
 *
 * Required env (see .env.example):
 *   GOOGLE_API_KEY, GOOGLE_CSE_ID, GOOGLE_SHEET_ID,
 *   GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SHEET_RANGE
 */
import axios from "axios";
import { google } from "googleapis";

export interface JobResult {
  title: string;
  link: string;
  snippet: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.startsWith("replace-")) {
    throw new Error(`Missing env var ${name} — set it in backend/.env`);
  }
  return v;
}

/**
 * Run a Google Custom Search query and return up to `max` results.
 *
 * Google returns 10 results per request and at most ~100 total, so we page
 * with the `start` index (1, 11, 21, …). Each page = 1 query against your
 * 100-queries/day free quota.
 */
export async function searchJobs(query: string, max = 30): Promise<JobResult[]> {
  const key = requireEnv("GOOGLE_API_KEY");
  const cx = requireEnv("GOOGLE_CSE_ID");

  const results: JobResult[] = [];
  for (let start = 1; results.length < max && start <= 91; start += 10) {
    const { data } = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: { key, cx, q: query, num: 10, start },
    });
    const items: any[] = data.items ?? [];
    for (const item of items) {
      results.push({
        title: item.title ?? "",
        link: item.link ?? "",
        snippet: (item.snippet ?? "").replace(/\s+/g, " ").trim(),
      });
    }
    if (items.length < 10) break; // last page reached
  }
  return results.slice(0, max);
}

/**
 * Append job results to the configured Google Sheet.
 * The sheet must be shared (Editor) with the service account's client_email.
 * Returns the number of rows appended.
 */
export async function saveToSheet(jobs: JobResult[]): Promise<number> {
  if (jobs.length === 0) return 0;

  const spreadsheetId = requireEnv("GOOGLE_SHEET_ID");
  const keyFile = requireEnv("GOOGLE_SERVICE_ACCOUNT_FILE");
  const range = process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A:E";

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const today = new Date().toISOString().slice(0, 10);
  const rows = jobs.map((j) => [j.title, j.link, j.snippet, "google", today]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });

  return rows.length;
}
