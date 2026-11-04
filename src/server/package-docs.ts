/**
 * One rule, in one place: a row of `package_documents` is either a document of the request, or a **part** cut
 * out of one by "עיבוד טופס" (`parentDocumentId` set). Almost every query means the former — the documents the
 * request is made of — and a bare `eq(requestId, …)` silently started including parts the day cutting shipped.
 *
 * So anything that means "the documents of this request" uses `ownDocuments()`. The exceptions are deliberate
 * and marked at their call site: looking a row up **by its own id** (a download link), and checking whether a
 * stored file belongs to a request (a part's file must be downloadable too).
 */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { schema } from "@/db";

const { packageDocuments } = schema;

/** The documents of one request, never the parts cut out of them. */
export const ownDocuments = (requestId: string) =>
  and(eq(packageDocuments.requestId, requestId), isNull(packageDocuments.parentDocumentId));

/** The documents of several requests, never their parts. */
export const ownDocumentsIn = (requestIds: string[]) =>
  and(inArray(packageDocuments.requestId, requestIds), isNull(packageDocuments.parentDocumentId));

/** The parts cut out of the documents of one request. */
export const partsOf = (requestId: string) =>
  and(eq(packageDocuments.requestId, requestId), isNotNull(packageDocuments.parentDocumentId));
