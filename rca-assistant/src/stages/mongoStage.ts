/**
 * STAGE 2: MongoDB Data-Check
 *
 * Read-only checks against the Supplier module's operational database:
 *  - does a record exist for the supplier?
 *  - are any critical fields null/missing/malformed?
 *  - are there duplicate records for the same supplier (by taxId)?
 *  - was the record modified suspiciously close to when the issue was reported?
 *
 * This driver never writes - it only uses find/countDocuments. Wire RCA_MONGODB_URI
 * to a read-only database user as an extra safety net.
 */
import { MongoClient } from 'mongodb';
import { env } from '../config/env';
import { RCATicketInput, StageResult } from '../types/rca';
import { completedResult, matchesAny, runStageSafely, ticketText } from './stageUtils';

const CRITICAL_FIELDS = ['bankDetails.accountNumber', 'taxId', 'address', 'status'];

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isMalformed(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

interface SupplierRecord {
  supplierId: string;
  taxId?: string;
  updatedAt?: string | Date;
  [key: string]: unknown;
}

async function runRealMongoCheck(ticket: RCATicketInput): Promise<StageResult> {
  const client = new MongoClient(env.mongo.uri as string, { serverSelectionTimeoutMS: 8000 });

  try {
    await client.connect();
    const db = client.db(env.mongo.dbName);
    const collection = db.collection<SupplierRecord>(env.mongo.supplierCollection);

    const query = { supplierId: ticket.supplierId };
    const supplier = ticket.supplierId ? await collection.findOne(query) : null;

    if (ticket.supplierId && !supplier) {
      return completedResult(
        'mongo',
        true,
        `No supplier record found for supplierId "${ticket.supplierId}".`,
        `Query: db.${env.mongo.supplierCollection}.findOne(${JSON.stringify(query)}) -> null`,
        'high',
        { query, result: null }
      );
    }

    if (!supplier) {
      return completedResult(
        'mongo',
        false,
        '',
        'No supplierId was provided on the ticket, so no targeted supplier lookup could be run.',
        'low',
        { query: null, result: null }
      );
    }

    const malformedFields = CRITICAL_FIELDS.filter((path) => isMalformed(getByPath(supplier, path)));
    if (malformedFields.length > 0) {
      return completedResult(
        'mongo',
        true,
        `Critical field(s) null/missing on supplier record: ${malformedFields.join(', ')}.`,
        `Query: db.${env.mongo.supplierCollection}.findOne(${JSON.stringify(query)}); missing fields: ${malformedFields.join(', ')}`,
        'high',
        { query, malformedFields, record: supplier }
      );
    }

    if (supplier.taxId) {
      const duplicateCount = await collection.countDocuments({
        taxId: supplier.taxId,
        supplierId: { $ne: supplier.supplierId },
      });
      if (duplicateCount > 0) {
        return completedResult(
          'mongo',
          true,
          `Found ${duplicateCount} other supplier record(s) sharing taxId "${supplier.taxId}" (possible duplicate).`,
          `Query: db.${env.mongo.supplierCollection}.countDocuments({ taxId: "${supplier.taxId}", supplierId: { $ne: "${supplier.supplierId}" } }) -> ${duplicateCount}`,
          'medium',
          { taxId: supplier.taxId, duplicateCount }
        );
      }
    }

    if (ticket.reportedAt && supplier.updatedAt) {
      const reportedAt = new Date(ticket.reportedAt).getTime();
      const updatedAt = new Date(supplier.updatedAt).getTime();
      const withinDay = Math.abs(reportedAt - updatedAt) < 24 * 60 * 60 * 1000;
      if (withinDay) {
        return completedResult(
          'mongo',
          true,
          `Supplier record was updated at ${supplier.updatedAt}, within 24h of the reported issue - likely related to a recent data change.`,
          `Compared record.updatedAt (${supplier.updatedAt}) to ticket.reportedAt (${ticket.reportedAt}).`,
          'medium',
          { updatedAt: supplier.updatedAt, reportedAt: ticket.reportedAt }
        );
      }
    }

    return completedResult(
      'mongo',
      false,
      '',
      `Supplier record found and all critical fields (${CRITICAL_FIELDS.join(', ')}) populated; no duplicates or suspicious recent updates.`,
      'high',
      { query, record: supplier }
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

const MOCK_DATA_PATTERNS = [
  /bank detail/i, /null/i, /missing (field|data|record)/i, /duplicate/i, /incorrect data/i, /corrupt/i,
];

async function runMockMongoCheck(ticket: RCATicketInput): Promise<StageResult> {
  const found = matchesAny(ticketText(ticket), MOCK_DATA_PATTERNS);
  return completedResult(
    'mongo',
    found,
    found ? '[MOCK] Ticket language suggests a data-level problem with the supplier record.' : '',
    '[MOCK] No RCA_MONGODB_URI configured - keyword heuristic used instead of a real query.',
    found ? 'medium' : 'low',
    { mode: 'mock', supplierId: ticket.supplierId },
    true
  );
}

export async function checkMongoData(ticket: RCATicketInput): Promise<StageResult> {
  return runStageSafely('mongo', async () => {
    if (!env.mongo.uri) {
      return runMockMongoCheck(ticket);
    }
    return runRealMongoCheck(ticket);
  });
}
