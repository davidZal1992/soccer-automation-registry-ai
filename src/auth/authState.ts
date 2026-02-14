import { readFile } from 'fs/promises';
import writeFile from 'write-file-atomic';
import { join } from 'path';
import type { AuthenticationCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';

/**
 * Custom auth state implementation using atomic file writes
 * Prevents session corruption on crashes (kill -9, power loss, etc.)
 *
 * Uses write-file-atomic instead of Baileys' useMultiFileAuthState
 * which has I/O performance issues in production environments.
 *
 * @param dataDir - Directory to store auth files (creds.json, keys.json)
 * @returns Auth state object compatible with Baileys makeWASocket
 */
export async function useJsonAuthState(dataDir: string) {
  const credsPath = join(dataDir, 'creds.json');
  const keysPath = join(dataDir, 'keys.json');

  // Load existing credentials or initialize empty
  let creds: AuthenticationCreds;
  try {
    const credsData = await readFile(credsPath, 'utf-8');
    creds = JSON.parse(credsData);
  } catch (error) {
    // First run - no credentials exist yet
    creds = {} as AuthenticationCreds;
  }

  // Load existing keys or initialize empty
  let keys: SignalDataTypeMap;
  try {
    const keysData = await readFile(keysPath, 'utf-8');
    keys = JSON.parse(keysData);
  } catch (error) {
    // First run - no keys exist yet
    keys = {} as SignalDataTypeMap;
  }

  /**
   * Atomically save credentials to disk
   * Uses write-file-atomic to prevent corruption on process kill
   */
  const saveCreds = async (): Promise<void> => {
    await writeFile(credsPath, JSON.stringify(creds, null, 2), 'utf-8');
  };

  /**
   * Atomically save signal keys to disk
   * Uses write-file-atomic to prevent corruption on process kill
   */
  const saveKeys = async (): Promise<void> => {
    await writeFile(keysPath, JSON.stringify(keys, null, 2), 'utf-8');
  };

  return {
    state: {
      creds,
      keys
    },
    saveCreds,
    saveKeys
  };
}
