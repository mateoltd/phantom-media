import "../server-boundary.ts";
import { createPermitPool } from "../concurrency.ts";
import { ResourceCache, waitFor } from "../cache.ts";
import { UpstreamError, type FailureKind } from "../errors.ts";
import { readLimitedText } from "../media/read.ts";
import { documentPolicy, validateVariables, validatePageLimit } from "./request-policy.ts";
import { PERSISTED, type PersistedName } from "./operations.ts";

const ENDPOINT = "https://gql.twitch.tv/gql";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
type Envelope = { data?: unknown; errors?: { message?: string; path?: (string | number)[]; extensions?: { code?: string } }[] };
export interface Operation<T = unknown> {
  name: string; family: string; document: Record<string, unknown>;
  validate: (data: unknown) => T;
  discovery?: boolean;
  optionalErrorPath?: readonly string[];
  method?: "GET" | "POST";
  timeoutMs?: number;
  maxBytes?: number;
}
export type OperationResult<T = unknown> = { ok: true; data: T } | { ok: false; error: UpstreamError };
export class BatchRejectedError extends UpstreamError {
  readonly delivery = "none";
  constructor(kind: FailureKind = "schema") { super(kind); this.name = "BatchRejectedError"; }
}
const cooldowns = new Map<string, { until: number; kind: "integrity" | "rate-limit" }>();
const publicReads = new ResourceCache<unknown>(64, 8 * 1024 * 1024, value => JSON.stringify(value).length * 2);
const requests = createPermitPool(6, 32);

function guardFamily(family: string) {
  const entry = cooldowns.get(family);
  if (!entry) return;
  if (entry.until <= Date.now()) { cooldowns.delete(family); return; }
  throw new UpstreamError(entry.kind, entry.kind === "integrity" ? 0 : Math.ceil((entry.until - Date.now()) / 1000));
}
function flag(family: string, kind: FailureKind, retryAfter = 0) {
  if (kind === "integrity" || kind === "rate-limit") {
    if (cooldowns.size >= 64) cooldowns.delete(cooldowns.keys().next().value!);
    cooldowns.set(family, { kind, until: Date.now() + (kind === "integrity" ? 300 : Math.max(30, retryAfter)) * 1000 });
  }
}
function envelopeError(payload: Envelope, operation: Operation): UpstreamError | undefined {
  const integrity = payload.errors?.some(error => error.extensions?.code === "IntegrityCheckFailed" || /integrity check/i.test(error.message ?? ""));
  if (integrity) { flag(operation.family, "integrity"); return new UpstreamError("integrity"); }
  const errors = payload.errors?.filter(error => !operation.optionalErrorPath || !operation.optionalErrorPath.every((part, index) => error.path?.[index] === part));
  if (!errors?.length) return;
  const message = errors[0].message ?? "";
  const kind = /rate.?limit|too many requests/i.test(message) ? "rate-limit" : /^(Channel|Video|VOD) not found$/i.test(message) ? "not-found" : /service error|internal server|temporar|timeout|unavailable/i.test(message) ? "transport" : "schema";
  const retryAfter = kind === "rate-limit" ? 60 : operation.discovery ? 15 : 0;
  flag(operation.family, kind, retryAfter);
  return new UpstreamError(kind, retryAfter);
}
function normalize<T>(payload: unknown, operation: Operation<T>): OperationResult<T> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: new UpstreamError("schema") };
  const envelope = payload as Envelope;
  if (envelope.errors !== undefined && (!Array.isArray(envelope.errors) || envelope.errors.some(error => !error || typeof error !== "object"))) return { ok: false, error: new UpstreamError("schema") };
  const error = envelopeError(envelope, operation);
  if (error) return { ok: false, error };
  try {
    if (envelope.data === null || envelope.data === undefined) throw new UpstreamError("schema");
    return { ok: true, data: operation.validate(envelope.data) };
  } catch (error) { return { ok: false, error: error instanceof UpstreamError ? error : new UpstreamError("schema") }; }
}
function validateOperation(operation: Operation) {
  validateVariables(operation.document.variables);
  if (operation.timeoutMs !== undefined && (!Number.isInteger(operation.timeoutMs) || operation.timeoutMs < 100 || operation.timeoutMs > 60_000)) throw new UpstreamError("cap");
  if (operation.maxBytes !== undefined && (!Number.isInteger(operation.maxBytes) || operation.maxBytes < 1 || operation.maxBytes > 16 * 1024 * 1024)) throw new UpstreamError("cap");
  const query = operation.document.query;
  if (typeof query === "string") {
    if (operation.method === "GET") throw new UpstreamError("unavailable");
    const policy = documentPolicy(query);
    if (policy.name !== operation.name || policy.family !== operation.family) throw new UpstreamError("schema");
    validatePageLimit(operation.name, (operation.document.variables as Record<string, unknown> | undefined)?.first);
  } else {
    const contract = PERSISTED[operation.name as PersistedName];
    const extensions = operation.document.extensions as { persistedQuery?: { sha256Hash?: string; version?: number } } | undefined;
    if (!contract || contract.family !== operation.family || extensions?.persistedQuery?.sha256Hash !== contract.hash || extensions.persistedQuery.version !== 1) throw new UpstreamError("unavailable");
    if (operation.method === "GET" && !("get" in contract)) throw new UpstreamError("unavailable");
  }
}
function retryAfter(response: Response) {
  const raw = response.headers.get("Retry-After");
  const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - Date.now()) / 1000 : 60;
  return Math.min(300, Math.max(1, Number.isFinite(seconds) ? Math.ceil(seconds) : 60));
}
async function send(operations: Operation[], batch: boolean, signal?: AbortSignal): Promise<unknown> {
  if (!operations.length || operations.length > 35) throw new BatchRejectedError("cap");
  operations.forEach(validateOperation);
  const body = JSON.stringify(batch ? operations.map(operation => operation.document) : operations[0].document);
  if (new TextEncoder().encode(body).byteLength > 1024 * 1024) throw new BatchRejectedError("cap");
  operations.forEach(operation => guardFamily(operation.family));
  const release = await requests.acquire(signal);
  try {
    operations.forEach(operation => guardFamily(operation.family));
    const method = !batch && operations[0].method === "GET" ? "GET" : "POST";
    const url = new URL(ENDPOINT);
    if (method === "GET") for (const [key, value] of Object.entries(operations[0].document)) url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    const timeout = Math.max(...operations.map(operation => operation.timeoutMs ?? 12_000));
    const response = await fetch(url.href, {
      method, headers: { "Client-Id": CLIENT_ID, Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: method === "POST" ? body : undefined, cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      const kind = response.status === 429 ? "rate-limit" : response.status === 401 || response.status === 403 ? "unavailable" : response.status >= 500 ? "transport" : "schema";
      const delay = kind === "rate-limit" ? retryAfter(response) : operations[0].discovery ? 15 : 0;
      operations.forEach(operation => flag(operation.family, kind, delay));
      await response.body?.cancel();
      throw new UpstreamError(kind, delay);
    }
    const maxBytes = Math.min(16 * 1024 * 1024, operations.reduce((sum, operation) => sum + (operation.maxBytes ?? 1024 * 1024), 0));
    return JSON.parse(await readLimitedText(response, maxBytes));
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(error instanceof SyntaxError ? "schema" : "transport", operations[0].discovery ? 15 : 0);
  } finally { release(); }
}
export async function execute<T>(operation: Operation<T>, signal?: AbortSignal): Promise<T> {
  const attempts = operation.discovery ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = normalize(await send([operation], false, signal), operation);
      if (!result.ok) throw result.error;
      return result.data;
    } catch (error) {
      if (!(error instanceof UpstreamError) || error.kind !== "transport" || attempt === attempts - 1) throw error;
      await waitFor(new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)), signal);
    }
  }
  throw new UpstreamError("transport");
}
export async function executeBatch(operations: Operation[], signal?: AbortSignal): Promise<OperationResult[]> {
  if (!operations.length) return [];
  let payload: unknown;
  try { payload = await send(operations, true, signal); }
  catch (error) {
    if (error instanceof UpstreamError && (error.kind === "schema" || error.kind === "cap")) throw new BatchRejectedError(error.kind);
    throw error;
  }
  if (!Array.isArray(payload) || payload.length !== operations.length) throw new BatchRejectedError(!Array.isArray(payload) && JSON.stringify(payload).includes("Invalid GraphQL request") ? "cap" : "schema");
  return payload.map((value, index) => normalize(value, operations[index]));
}
const objectData = <T>(data: unknown) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UpstreamError("schema");
  return data as T;
};
export function runQuery<T>(query: string, variables?: Record<string, unknown>, options: { discovery?: boolean; cache?: boolean; optionalErrorPath?: readonly string[]; timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = {}): Promise<T> {
  const policy = documentPolicy(query);
  const { cache = true, signal, ...operationOptions } = options;
  const operation: Operation<T> = { ...policy, ...operationOptions, document: { query, variables }, validate: objectData<T> };
  const load = () => execute(operation);
  return options.discovery && cache ? publicReads.load(JSON.stringify([query, variables]), load, 60_000, signal).then(value => value as T) : execute(operation, signal);
}
export function runDiscoveryQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  return runQuery<T>(query, variables, { discovery: true });
}
export function runPersisted<T>(name: PersistedName, variables: Record<string, unknown>, validate: (data: unknown) => T, options: { method?: "GET" | "POST"; signal?: AbortSignal; discovery?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const contract = PERSISTED[name];
  return execute({ name, family: contract.family, document: { operationName: name, variables,
    extensions: { persistedQuery: { version: 1, sha256Hash: contract.hash } } }, validate, method: options.method, discovery: options.discovery, timeoutMs: options.timeoutMs }, options.signal);
}
