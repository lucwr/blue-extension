/**
 * One-shot job-search runner.
 *
 *   npm --workspace backend run jobs
 *   npm --workspace backend run jobs -- "site:jobs.lever.co react remote US"
 *
 * The query can be passed as a CLI arg; otherwise the DEFAULT_QUERY is used.
 * Loads backend/.env via `dotenv/config` (must be imported first so the
 * service sees the vars).
 */
import "dotenv/config";
import { searchJobs, saveToSheet } from "../src/services/jobSearch.js";

const DEFAULT_QUERY =
  "site:jobs.ashbyhq.com remote jobs in US for Full stack developer";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim() || DEFAULT_QUERY;
  console.log(`🔎 Query: ${query}`);

  const jobs = await searchJobs(query, 30);
  console.log(`   Found ${jobs.length} result(s).`);
  if (jobs.length === 0) {
    console.log("   Nothing to save. (Check the query or that the CSE is set to 'Search the entire web'.)");
    return;
  }

  const saved = await saveToSheet(jobs);
  console.log(`✅ Appended ${saved} row(s) to the sheet.`);
}

main().catch((err: unknown) => {
  // Surface Google API errors clearly (axios wraps them under response.data).
  const e = err as { response?: { status?: number; data?: unknown }; message?: string };
  if (e.response) {
    console.error(`❌ API error ${e.response.status}:`, JSON.stringify(e.response.data, null, 2));
  } else {
    console.error("❌", e.message ?? err);
  }
  process.exitCode = 1;
});
