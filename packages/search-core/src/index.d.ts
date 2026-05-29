export declare const sqliteSchema = "\nPRAGMA foreign_keys = ON;\nCREATE TABLE IF NOT EXISTS accounts (\n  id TEXT PRIMARY KEY,\n  provider TEXT NOT NULL,\n  email TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS threads (\n  id TEXT PRIMARY KEY,\n  account_id TEXT NOT NULL REFERENCES accounts(id),\n  subject TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS messages (\n  id TEXT PRIMARY KEY,\n  thread_id TEXT NOT NULL REFERENCES threads(id),\n  sender TEXT NOT NULL,\n  recipients_json TEXT NOT NULL,\n  subject TEXT NOT NULL,\n  body_ciphertext TEXT NOT NULL,\n  body_preview TEXT NOT NULL,\n  received_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS attachment_metadata (\n  id TEXT PRIMARY KEY,\n  message_id TEXT NOT NULL REFERENCES messages(id),\n  filename TEXT NOT NULL,\n  mime_type TEXT NOT NULL,\n  byte_size INTEGER NOT NULL\n);\nCREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, sender, recipients, body_preview, content='');\n";
export declare const encryptionDecision: {
    choice: string;
    why: string[];
};
export interface NormalizedThread {
    id: string;
    accountId: string;
    subject: string;
    sender: string;
    senderEmail: string;
    recipients: string[];
    snippet: string;
    body: string;
    receivedAt: string;
}
export interface SearchRow {
    thread: {
        id: string;
        account_id: string;
        subject: string;
        updated_at: string;
    };
    message: {
        id: string;
        thread_id: string;
        sender: string;
        recipients_json: string;
        subject: string;
        body_ciphertext: string;
        body_preview: string;
        received_at: string;
    };
    fts: {
        subject: string;
        sender: string;
        recipients: string;
        body_preview: string;
    };
}
export interface SearchResult extends NormalizedThread {
    score: number;
    snippet: string;
}
export interface InMemorySearchIndex {
    addThread(thread: Record<string, unknown>): void;
    seed(threads: Record<string, unknown>[]): void;
    search(query: string): SearchResult[];
}
export declare function createInMemorySearchIndex(): InMemorySearchIndex;
export declare function normalizeSearchTerms(query: string): string[];
export declare function normalizeThread(thread: Record<string, unknown>): NormalizedThread;
export declare function buildSearchRows(thread: Record<string, unknown>): SearchRow;
