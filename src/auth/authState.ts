import { readFile, mkdir } from 'fs/promises';
import writeFile from 'write-file-atomic';
import { join } from 'path';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, SignalDataTypeMap, SignalKeyStore } from '@whiskeysockets/baileys';

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
  await mkdir(dataDir, { recursive: true });

  const credsPath = join(dataDir, 'creds.json');
  const keysPath = join(dataDir, 'keys.json');

  // Load existing credentials or generate fresh ones with proper crypto keys
  let creds: AuthenticationCreds;
  try {
    const credsData = await readFile(credsPath, 'utf-8');
    creds = JSON.parse(credsData, BufferJSON.reviver);
  } catch (error) {
    // First run - generate proper credentials (noise keypair, signal keys, etc.)
    creds = initAuthCreds();
  }

  // Load existing keys or initialize empty
  let keysData: SignalDataTypeMap = {} as SignalDataTypeMap;
  try {
    const keysJson = await readFile(keysPath, 'utf-8');
    keysData = JSON.parse(keysJson, BufferJSON.reviver);
  } catch (error) {
    // First run - no keys exist yet
    keysData = {} as SignalDataTypeMap;
  }

  /**
   * Atomically save credentials to disk
   * Uses write-file-atomic to prevent corruption on process kill
   */
  const saveCreds = async (): Promise<void> => {
    await writeFile(credsPath, JSON.stringify(creds, BufferJSON.replacer, 2), 'utf-8');
  };

  /**
   * Atomically save signal keys to disk
   * Uses write-file-atomic to prevent corruption on process kill
   */
  const saveKeys = async (): Promise<void> => {
    await writeFile(keysPath, JSON.stringify(keysData, BufferJSON.replacer, 2), 'utf-8');
  };

  // Create SignalKeyStore interface wrapper around the data
  const keys: SignalKeyStore = {
    get: async (type, ids) => {
      const data: { [id: string]: any } = {};
      const typeData = (keysData[type] as any) || {};
      for (const id of ids) {
        let value = (typeData as any)[id];
        if (value) {
          data[id] = value;
        }
      }
      return data;
    },
    set: async (data) => {
      for (const type in data) {
        if (!keysData[type as keyof SignalDataTypeMap]) {
          keysData[type as keyof SignalDataTypeMap] = {} as any;
        }
        const typeData = data[type as keyof SignalDataTypeMap];
        if (typeData) {
          for (const id in typeData) {
            const value = typeData[id];
            if (value === null) {
              delete (keysData[type as keyof SignalDataTypeMap] as any)[id];
            } else {
              (keysData[type as keyof SignalDataTypeMap] as any)[id] = value;
            }
          }
        }
      }
      await saveKeys();
    }
  };

  return {
    state: {
      creds,
      keys
    },
    saveCreds
  };
}
